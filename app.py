import os
import json
import glob
import time
import uuid
import subprocess
import sys
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from ytmusicapi import YTMusic
import requests
from PIL import Image, ImageFilter
from io import BytesIO
import urllib.request

# Tenta importar a coverpy, mas não quebra se não existir
try:
    from coverpy import CoverPy
    client = CoverPy()
    COVERPY_DISPONIVEL = True
except Exception as e:
    print(f"Coverpy não disponível: {e}")
    client = None
    COVERPY_DISPONIVEL = False

app = Flask(__name__)
CORS(app)

ytmusic = YTMusic()

STICKERS_FILE = 'stickers.json'
UPLOADS_DIR = 'uploads'

if not os.path.exists(UPLOADS_DIR):
    os.makedirs(UPLOADS_DIR)

cache_capas = {}
cache_audio = {}

def calcular_cor_dominante(url_imagem):
    try:
        with urllib.request.urlopen(url_imagem, timeout=5) as resp:
            img = Image.open(BytesIO(resp.read())).convert('RGB')
            img = img.resize((80, 80))
            baldes = {}
            for pixel in img.getdata():
                r, g, b = pixel
                chave = (r // 32, g // 32, b // 32)
                if chave not in baldes:
                    baldes[chave] = {"count": 0, "r": 0, "g": 0, "b": 0}
                baldes[chave]["count"] += 1
                baldes[chave]["r"] += r
                baldes[chave]["g"] += g
                baldes[chave]["b"] += b
            ordenados = sorted(baldes.values(), key=lambda x: x["count"], reverse=True)
            filtrados = []
            for b in ordenados:
                r = b["r"] // b["count"]
                g = b["g"] // b["count"]
                bl = b["b"] // b["count"]
                brilho = (r + g + bl) / 3
                if 25 < brilho < 230:
                    filtrados.append(b)
            if len(filtrados) >= 2:
                alvo = filtrados[1]
            elif len(filtrados) == 1:
                alvo = filtrados[0]
            else:
                return {"r": 40, "g": 40, "b": 40}
            return {"r": alvo["r"] // alvo["count"], "g": alvo["g"] // alvo["count"], "b": alvo["b"] // alvo["count"]}
    except Exception:
        return {"r": 40, "g": 40, "b": 40}

def adicionar_borda_branca(caminho, espessura=10):
    img = Image.open(caminho).convert("RGBA")
    alpha = img.split()[3]
    tamanho_kernel = espessura * 2 + 1
    alpha_expandida = alpha.filter(ImageFilter.MaxFilter(tamanho_kernel))
    branco = Image.new("RGBA", img.size, (255, 255, 255, 255))
    branco.putalpha(alpha_expandida)
    resultado = Image.alpha_composite(branco, img)
    resultado.save(caminho, "PNG")

def buscar_capa_com_cache(artist, album, thumb_fallback=None):
    """Busca a capa. Se a coverpy não estiver disponível, usa a thumb do YouTube."""
    chave = f"{artist}::{album}".lower()
    if chave in cache_capas:
        entrada = cache_capas[chave]
        if time.time() - entrada["timestamp"] < 300:
            return entrada["static_url"], entrada["video_url"]

    static_url = thumb_fallback
    video_url = None

    if COVERPY_DISPONIVEL and client:
        try:
            results = client.search(f"{artist} {album}", limit=1)
            if results:
                result = results[0]
                static_url = result.artwork(1200)
                motion = client.get_motion_artwork(result)
                if motion:
                    video_url = motion.video_url
        except Exception:
            pass

    cache_capas[chave] = {"static_url": static_url, "video_url": video_url, "timestamp": time.time()}
    return static_url, video_url

def resolver_audio(video_id):
    if video_id in cache_audio:
        entrada = cache_audio[video_id]
        if time.time() - entrada["timestamp"] < 3600:
            return entrada["url"]
    try:
        # No Termux, o yt-dlp é chamado como módulo Python
        result = subprocess.run(
            [sys.executable, "-m", "yt_dlp", "-f", "bestaudio", "--get-url",
             f"https://music.youtube.com/watch?v={video_id}"],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0:
            url = result.stdout.strip().split('\n')[0]
            cache_audio[video_id] = {"url": url, "timestamp": time.time()}
            return url
        else:
            print(f"yt-dlp erro: {result.stderr[:200]}")
    except Exception as e:
        print(f"Erro ao resolver áudio: {e}")
    return None

def carregar_stickers():
    if os.path.exists(STICKERS_FILE):
        try:
            with open(STICKERS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def salvar_stickers(dados):
    with open(STICKERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)

@app.route('/')
def home():
    return jsonify({"status": "online"})

@app.route('/visualizador')
def visualizador():
    return send_from_directory('.', 'index.html')

@app.route('/style.css')
def servir_css():
    return send_from_directory('.', 'style.css')

@app.route('/script.js')
def servir_js():
    return send_from_directory('.', 'script.js')

@app.route('/overlay.png')
def servir_overlay():
    return send_from_directory('.', 'overlay.png')

@app.route('/uploads/<path:nome>')
def servir_upload(nome):
    return send_from_directory(UPLOADS_DIR, nome)

@app.route('/api/uploads/listar', methods=['GET'])
def listar_uploads():
    if not os.path.exists(UPLOADS_DIR):
        return jsonify([])
    arquivos = []
    for ext in ('*.png', '*.PNG', '*.webp', '*.gif', '*.jpg', '*.jpeg'):
        arquivos.extend(glob.glob(os.path.join(UPLOADS_DIR, ext)))
    arquivos.sort(key=os.path.getmtime, reverse=True)
    return jsonify([os.path.basename(a) for a in arquivos])

@app.route('/api/upload', methods=['POST'])
def upload_sticker():
    if 'file' not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Nome de arquivo vazio"}), 400
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.png', '.webp', '.gif', '.jpg', '.jpeg'):
        return jsonify({"error": "Formato não suportado"}), 400

    nome_unico = f"{uuid.uuid4().hex}{ext}"
    caminho = os.path.join(UPLOADS_DIR, nome_unico)
    file.save(caminho)

    if ext in ('.png', '.webp', '.jpg', '.jpeg'):
        try:
            adicionar_borda_branca(caminho, espessura=10)
        except Exception as e:
            print(f"Erro ao adicionar borda: {e}")

    return jsonify({"arquivo": nome_unico})

@app.route('/api/upload/<nome>', methods=['DELETE'])
def deletar_upload(nome):
    caminho = os.path.join(UPLOADS_DIR, nome)
    if not os.path.exists(caminho):
        return jsonify({"error": "Arquivo não encontrado"}), 404
    try:
        os.remove(caminho)
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stickers', methods=['GET'])
def get_stickers():
    artist = request.args.get('artist', '')
    track = request.args.get('track', '')
    chave = f"{artist}::{track}"
    todos = carregar_stickers()
    return jsonify(todos.get(chave, []))

@app.route('/api/stickers', methods=['POST'])
def post_stickers():
    data = request.get_json()
    artist = data.get('artist', '')
    track = data.get('track', '')
    stickers = data.get('stickers', [])
    chave = f"{artist}::{track}"
    todos = carregar_stickers()
    todos[chave] = stickers
    salvar_stickers(todos)
    return jsonify({"status": "ok", "count": len(stickers)})

@app.route('/api/youtube/search')
def youtube_search():
    query = request.args.get('q')
    if not query:
        return jsonify({"error": "Parâmetro 'q' é obrigatório"}), 400
    try:
        resultados = ytmusic.search(query, filter="songs", limit=10)
        lista = []
        for r in resultados:
            artistas = r.get("artists") or []
            artista = artistas[0].get("name", "Desconhecido") if artistas else "Desconhecido"
            album_info = r.get("album") or {}
            thumbs = r.get("thumbnails") or []
            thumb = thumbs[-1].get("url", "") if thumbs else ""
            lista.append({
                "videoId": r.get("videoId"),
                "titulo": r.get("title", ""),
                "artista": artista,
                "album": album_info.get("name", "") if isinstance(album_info, dict) else "",
                "thumb": thumb
            })
        return jsonify(lista)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/youtube/play')
def youtube_play():
    video_id = request.args.get('id')
    if not video_id:
        return jsonify({"error": "Parâmetro 'id' é obrigatório"}), 400

    try:
        info = ytmusic.get_song(video_id)
        detalhes = info.get("videoDetails", {})
        titulo = detalhes.get("title", "")
        artista = detalhes.get("author", "")

        # Pega a thumb do YouTube como fallback
        thumbs = detalhes.get("thumbnail", {}).get("thumbnails", [])
        thumb_yt = thumbs[-1].get("url", "") if thumbs else ""

        static_url, video_url = buscar_capa_com_cache(artista, titulo, thumb_yt)
        audio_url = resolver_audio(video_id)

        cor = {"r": 40, "g": 40, "b": 40}
        if static_url:
            cor = calcular_cor_dominante(static_url)

        return jsonify({
            "track": titulo,
            "artist": artista,
            "album": "",
            "video_url": video_url,
            "static_url": static_url,
            "audio_url": audio_url,
            "dominant_color": cor
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000, host='127.0.0.1')