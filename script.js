const capaImgEl = document.getElementById('capa-img');
const capaPrincipalVideoEl = document.getElementById('capa-principal-video');
const capaPrincipalImgEl = document.getElementById('capa-principal-img');
const painelEl = document.getElementById('painel');
const telaEl = document.getElementById('tela');
const musicaEl = document.getElementById('musica');
const artistaEl = document.getElementById('artista');

const adesivosEl = document.getElementById('adesivos');
const assistiveEl = document.getElementById('assistive');
const assistiveBtn = document.getElementById('assistive-btn');
const opcaoPesquisar = document.getElementById('opcao-pesquisar');
const opcaoStickers = document.getElementById('opcao-stickers');
const modalPesquisa = document.getElementById('modal-pesquisa');
const modalVoltar = document.getElementById('modal-voltar');
const inputBusca = document.getElementById('input-busca');
const btnPesquisarConfirmar = document.getElementById('btn-pesquisar-confirmar');
const resultadosBusca = document.getElementById('resultados-busca');
const inputArquivo = document.getElementById('input-arquivo');
const painelGaleria = document.getElementById('painel-galeria');
const galeriaLista = document.getElementById('galeria-lista');
const galeriaUpload = document.getElementById('galeria-upload');
const audioPlayer = document.getElementById('audio-player');
const SERVER_URL = 'http://127.0.0.1:5000';
const barraProgresso = document.getElementById('barra-progresso');
const progressoPreenchido = document.getElementById('progresso-preenchido');
const btnAnterior = document.getElementById('btn-anterior');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnProximo = document.getElementById('btn-proximo');
const volumeSlider = document.getElementById('volume-slider');

const SERVER_URL = window.location.origin;

let adesivosAtuais = [];
let musicaAtual = null;
let modoEdicao = false;

async function pesquisarMusica() {
    const query = inputBusca.value.trim();
    if (!query) return;

    try {
        const response = await fetch(`${SERVER_URL}/api/youtube/search?q=${encodeURIComponent(query)}`);
        const resultados = await response.json();

        resultadosBusca.innerHTML = '';
        if (!Array.isArray(resultados) || resultados.length === 0) {
            resultadosBusca.innerHTML = '<div style="padding:1rem;text-align:center;color:#888;">Nenhum resultado</div>';
        } else {
            for (const r of resultados) {
                const div = document.createElement('div');
                div.className = 'resultado-item';
                div.innerHTML = `
                    <img class="resultado-thumb" src="${r.thumb}" alt="">
                    <div class="resultado-info">
                        <div class="resultado-titulo">${r.titulo}</div>
                        <div class="resultado-artista">${r.artista}</div>
                    </div>
                `;
                div.addEventListener('click', () => tocarMusica(r.videoId));
                resultadosBusca.appendChild(div);
            }
        }
        resultadosBusca.classList.add('ativo');
    } catch (error) {
        console.error('Erro na busca:', error);
    }
}

async function tocarMusica(videoId) {
    resultadosBusca.classList.remove('ativo');
    modalPesquisa.classList.remove('ativo');

    try {
        const response = await fetch(`${SERVER_URL}/api/youtube/play?id=${videoId}`);
        const data = await response.json();

        if (data.error) {
            alert('Erro ao tocar música: ' + data.error);
            return;
        }

        painelEl.classList.add('visivel');
        musicaEl.textContent = data.track;
        artistaEl.textContent = data.artist;

        musicaAtual = { artist: data.artist, track: data.track };
        carregarAdesivos(data.artist, data.track);

        if (data.video_url) {
            capaPrincipalVideoEl.src = data.video_url;
            capaPrincipalVideoEl.style.display = 'block';
            capaPrincipalImgEl.style.display = 'none';
            capaPrincipalVideoEl.play().catch(() => {});
        } else if (data.static_url) {
            capaPrincipalImgEl.src = data.static_url;
            capaPrincipalImgEl.style.display = 'block';
            capaPrincipalVideoEl.style.display = 'none';
        }

        if (data.static_url) {
            capaImgEl.src = data.static_url;
            capaImgEl.classList.add('visivel');
        }

        if (data.dominant_color) {
            const { r, g, b } = data.dominant_color;
            const fator = 0.5;
            telaEl.style.backgroundColor = `rgb(${Math.round(r * fator)}, ${Math.round(g * fator)}, ${Math.round(b * fator)})`;
        }

        if (data.audio_url) {
            audioPlayer.src = data.audio_url;
            audioPlayer.play().catch(e => console.warn('Erro ao tocar áudio:', e));
        }

    } catch (error) {
        console.error('Erro ao tocar:', error);
    }
}

function renderizarAdesivos() {
    adesivosEl.innerHTML = '';
    for (let i = 0; i < adesivosAtuais.length; i++) {
        const a = adesivosAtuais[i];
        const img = document.createElement('img');
        img.className = 'adesivo';
        img.src = `/uploads/${a.arquivo}`;
        img.style.left = a.x + '%';
        img.style.top = a.y + '%';
        img.style.width = a.size + 'px';
        img.style.transform = `translate(-50%, -50%) rotate(${a.rotation}deg)`;
        img.dataset.index = i;

        img.addEventListener('mousedown', (e) => {
            if (!modoEdicao) return;
            e.preventDefault();
            e.stopPropagation();
            const onMove = (ev) => {
                const x = (ev.clientX / window.innerWidth) * 100;
                const y = (ev.clientY / window.innerHeight) * 100;
                a.x = Math.max(0, Math.min(100, x));
                a.y = Math.max(0, Math.min(100, y));
                img.style.left = a.x + '%';
                img.style.top = a.y + '%';
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                salvarAdesivos();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        img.addEventListener('wheel', (e) => {
            if (!modoEdicao) return;
            e.preventDefault();
            if (e.shiftKey) {
                a.size = Math.max(20, Math.min(600, a.size + (e.deltaY > 0 ? -5 : 5)));
                img.style.width = a.size + 'px';
            } else {
                a.rotation += e.deltaY > 0 ? 5 : -5;
                img.style.transform = `translate(-50%, -50%) rotate(${a.rotation}deg)`;
            }
            salvarAdesivos();
        }, { passive: false });

        img.addEventListener('contextmenu', (e) => {
            if (!modoEdicao) return;
            e.preventDefault();
            adesivosAtuais.splice(i, 1);
            renderizarAdesivos();
            salvarAdesivos();
        });

        adesivosEl.appendChild(img);
    }
}

async function carregarAdesivos(artist, track) {
    try {
        const url = `${SERVER_URL}/api/stickers?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`;
        const response = await fetch(url);
        const data = await response.json();
        adesivosAtuais = Array.isArray(data) ? data : [];
        renderizarAdesivos();
    } catch (error) {
        console.error('Erro ao carregar adesivos:', error);
        adesivosAtuais = [];
        renderizarAdesivos();
    }
}

async function salvarAdesivos() {
    if (!musicaAtual) return;
    try {
        await fetch(`${SERVER_URL}/api/stickers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                artist: musicaAtual.artist,
                track: musicaAtual.track,
                stickers: adesivosAtuais
            })
        });
    } catch (error) {
        console.error('Erro ao salvar adesivos:', error);
    }
}

async function carregarGaleria() {
    try {
        const response = await fetch(`${SERVER_URL}/api/uploads/listar`);
        const arquivos = await response.json();
        galeriaLista.innerHTML = '';

        for (const nome of arquivos) {
            const wrapper = document.createElement('div');
            wrapper.className = 'galeria-wrapper';

            const img = document.createElement('img');
            img.className = 'galeria-item';
            img.src = `/uploads/${nome}`;
            img.alt = nome;

            img.addEventListener('click', (e) => {
                e.stopPropagation();
                adesivosAtuais.push({ x: 50, y: 50, size: 120, rotation: 0, arquivo: nome });
                if (!modoEdicao) {
                    modoEdicao = true;
                    document.body.classList.add('editando');
                }
                renderizarAdesivos();
                salvarAdesivos();
            });

            const btnExcluir = document.createElement('button');
            btnExcluir.className = 'galeria-excluir';
            btnExcluir.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            btnExcluir.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Excluir esta imagem da galeria?')) return;
                try {
                    const resp = await fetch(`${SERVER_URL}/api/upload/${encodeURIComponent(nome)}`, { method: 'DELETE' });
                    if (resp.ok) await carregarGaleria();
                } catch (err) {
                    console.error('Erro ao excluir:', err);
                }
            });

            wrapper.appendChild(img);
            wrapper.appendChild(btnExcluir);
            galeriaLista.appendChild(wrapper);
        }
    } catch (error) {
        console.error('Erro ao carregar galeria:', error);
    }
}

// --- EVENTOS ---

galeriaUpload.addEventListener('click', (e) => {
    e.stopPropagation();
    inputArquivo.click();
});

assistiveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    assistiveEl.classList.toggle('aberto');
});

document.addEventListener('click', (e) => {
    if (!assistiveEl.contains(e.target)) {
        assistiveEl.classList.remove('aberto');
    }
    if (!painelGaleria.contains(e.target) && !e.target.closest('.assistive')) {
        painelGaleria.classList.remove('ativo');
    }
});

opcaoPesquisar.addEventListener('click', (e) => {
    e.stopPropagation();
    assistiveEl.classList.remove('aberto');
    modalPesquisa.classList.add('ativo');
    inputBusca.focus();
});

btnPesquisarConfirmar.addEventListener('click', pesquisarMusica);
inputBusca.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') pesquisarMusica();
    if (e.key === 'Escape') {
        modalPesquisa.classList.remove('ativo');
        resultadosBusca.classList.remove('ativo');
    }
});

modalVoltar.addEventListener('click', (e) => {
    e.stopPropagation();
    modalPesquisa.classList.remove('ativo');
    resultadosBusca.classList.remove('ativo');
    inputBusca.value = '';
});

opcaoStickers.addEventListener('click', async (e) => {
    e.stopPropagation();
    assistiveEl.classList.remove('aberto');
    painelGaleria.classList.add('ativo');
    await carregarGaleria();
});

inputArquivo.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${SERVER_URL}/api/upload`, { method: 'POST', body: formData });
        const data = await response.json();
        if (data.error) {
            alert('Erro no upload: ' + data.error);
            return;
        }
        adesivosAtuais.push({ x: 50, y: 50, size: 120, rotation: 0, arquivo: data.arquivo });
        if (!modoEdicao) {
            modoEdicao = true;
            document.body.classList.add('editando');
        }
        renderizarAdesivos();
        salvarAdesivos();
        await carregarGaleria();
    } catch (error) {
        console.error('Erro no upload:', error);
    }
    inputArquivo.value = '';
});

// --- CONTROLES DO PLAYER ---
btnPlayPause.addEventListener('click', () => {
    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
});

btnAnterior.addEventListener('click', () => {
    audioPlayer.currentTime = 0;
});

btnProximo.addEventListener('click', () => {
    console.log('Próxima música - a implementar');
});

volumeSlider.addEventListener('input', (e) => {
    audioPlayer.volume = e.target.value / 100;
});

audioPlayer.addEventListener('timeupdate', () => {
    if (audioPlayer.duration) {
        const porcentagem = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressoPreenchido.style.width = porcentagem + '%';
    }
});

audioPlayer.addEventListener('play', () => {
    const icon = btnPlayPause.querySelector('i');
    icon.classList.remove('fa-play');
    icon.classList.add('fa-pause');
});

audioPlayer.addEventListener('pause', () => {
    const icon = btnPlayPause.querySelector('i');
    icon.classList.remove('fa-pause');
    icon.classList.add('fa-play');
});

barraProgresso.addEventListener('click', (e) => {
    const rect = barraProgresso.getBoundingClientRect();
    const porcentagem = (e.clientX - rect.left) / rect.width;
    if (audioPlayer.duration) {
        audioPlayer.currentTime = porcentagem * audioPlayer.duration;
    }
});

// --- AÇÕES ---
document.getElementById('btn-letras').addEventListener('click', () => {
    console.log('Letras - a implementar');
});

document.getElementById('btn-equalizador').addEventListener('click', () => {
    console.log('Equalizador - a implementar');
});

document.getElementById('btn-fila').addEventListener('click', () => {
    console.log('Fila - a implementar');
});

// --- ARRASTAR O BOTÃO FLUTUANTE ---
let arrastando = false;
let offsetX, offsetY;

assistiveBtn.addEventListener('mousedown', (e) => {
    arrastando = true;
    const rect = assistiveEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    assistiveEl.style.transition = 'none';
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!arrastando) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    const largura = assistiveBtn.offsetWidth;
    const altura = assistiveBtn.offsetHeight;
    const maxX = window.innerWidth - largura;
    const maxY = window.innerHeight - altura;
    assistiveEl.style.left = Math.max(0, Math.min(maxX, x)) + 'px';
    assistiveEl.style.top = Math.max(0, Math.min(maxY, y)) + 'px';
    assistiveEl.style.right = 'auto';
    assistiveEl.style.bottom = 'auto';
});

document.addEventListener('mouseup', () => {
    if (arrastando) {
        assistiveEl.style.transition = '';
        arrastando = false;
    }
});

assistiveBtn.addEventListener('touchstart', (e) => {
    arrastando = true;
    const rect = assistiveEl.getBoundingClientRect();
    offsetX = e.touches[0].clientX - rect.left;
    offsetY = e.touches[0].clientY - rect.top;
    assistiveEl.style.transition = 'none';
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!arrastando) return;
    const x = e.touches[0].clientX - offsetX;
    const y = e.touches[0].clientY - offsetY;
    const largura = assistiveBtn.offsetWidth;
    const altura = assistiveBtn.offsetHeight;
    const maxX = window.innerWidth - largura;
    const maxY = window.innerHeight - altura;
    assistiveEl.style.left = Math.max(0, Math.min(maxX, x)) + 'px';
    assistiveEl.style.top = Math.max(0, Math.min(maxY, y)) + 'px';
    assistiveEl.style.right = 'auto';
    assistiveEl.style.bottom = 'auto';
}, { passive: true });

document.addEventListener('touchend', () => {
    if (arrastando) {
        assistiveEl.style.transition = '';
        arrastando = false;
    }
});

// --- BOTÃO DE TELA CHEIA ---
const btnFullscreen = document.getElementById('btn-fullscreen');

btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
            console.warn('Erro ao entrar em tela cheia:', err);
        });
    } else {
        document.exitFullscreen();
    }
});

document.addEventListener('fullscreenchange', () => {
    const icon = btnFullscreen.querySelector('i');
    if (document.fullscreenElement) {
        icon.classList.remove('fa-expand');
        icon.classList.add('fa-compress');
    } else {
        icon.classList.remove('fa-compress');
        icon.classList.add('fa-expand');
    }
});
