// --- ESTADO ---
let chats = [];
let currentChatId = null;
let searchResults = [];
let searchIndex = -1;

// --- ELEMENTOS ---
const els = {
    modal: document.getElementById('importModal'),
    chatList: document.getElementById('chatList'),
    emptyState: document.getElementById('emptyState'),
    chatView: document.getElementById('chatView'),
    msgContainer: document.getElementById('messagesContainer'),
    fileInput: document.getElementById('fileInput'),
    fileName: document.getElementById('fileNameDisplay'),
    inChatSearch: document.getElementById('inChatSearch'),
    msgSearchInput: document.getElementById('msgSearchInput'),
    searchCount: document.getElementById('searchCount'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    sidebar: document.getElementById('sidebar'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    lightbox: document.getElementById('mediaLightbox'),
    lightboxContainer: document.getElementById('lightboxMediaContainer')
};

// --- SIDEBAR MOBILE ---
function toggleSidebar() {
    els.sidebar.classList.toggle('open');
    els.sidebarOverlay.classList.toggle('active');
    document.body.classList.toggle('sidebar-open');
}

// --- LIGHTBOX (AMPLIAR MÍDIA) ---
function openLightbox(url, type) {
    els.lightboxContainer.innerHTML = '';

    let mediaEl;
    if (type === 'image') {
        mediaEl = document.createElement('img');
        mediaEl.src = url;
    } else if (type === 'video') {
        mediaEl = document.createElement('video');
        mediaEl.src = url;
        mediaEl.controls = true;
        mediaEl.autoplay = true;
    }

    if (mediaEl) {
        els.lightboxContainer.appendChild(mediaEl);
        els.lightbox.classList.remove('hidden');
    }
}

function closeLightbox() {
    els.lightbox.classList.add('hidden');
    els.lightboxContainer.innerHTML = ''; // Limpa para parar vídeo
}

// --- TEMA ---
function toggleTheme() {
    const html = document.documentElement;
    const cur = html.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    document.getElementById('themeIcon').innerText = next === 'dark' ? 'light_mode' : 'dark_mode';
}

// --- MODAL ---
function openModal() {
    els.modal.classList.add('active');
    document.getElementById('modalChatName').value = '';
    document.getElementById('modalOwnerName').value = '';
    els.fileInput.value = '';
    els.fileName.innerText = 'Clique ou arraste o .zip aqui';
    els.fileName.style.color = 'var(--text-secondary)';

    // Se estiver no mobile, fecha sidebar ao abrir modal
    if (window.innerWidth < 768) toggleSidebar();
}
function closeModal() { els.modal.classList.remove('active'); }

els.fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
        els.fileName.innerText = e.target.files[0].name;
        els.fileName.style.color = 'var(--accent)';
    }
});

// --- IMPORTAÇÃO ---
async function processImport() {
    const name = document.getElementById('modalChatName').value.trim();
    const ownerName = document.getElementById('modalOwnerName').value.trim();
    const file = els.fileInput.files[0];

    if (!name || !file) return alert("Preencha o nome da conversa e escolha o arquivo.");

    closeModal();
    els.loadingOverlay.classList.remove('hidden');

    try {
        const zip = new JSZip();
        await zip.loadAsync(file);

        let chatTxt = null;
        const mediaMap = {};

        const promises = [];
        zip.forEach((path, entry) => {
            if (path.endsWith('.txt') && path.toLowerCase().includes('chat')) {
                chatTxt = entry;
            } else if (!entry.dir) {
                promises.push(entry.async('blob').then(blob => {
                    const fname = path.split('/').pop();
                    mediaMap[fname] = URL.createObjectURL(blob);
                }));
            }
        });

        if (!chatTxt) throw new Error("Arquivo _chat.txt não encontrado.");
        await Promise.all(promises);

        const text = await chatTxt.async('string');
        const messages = parseMessages(text, mediaMap);

        const newChat = {
            id: Date.now(),
            name: name,
            owner: ownerName,
            messages: messages,
            mediaMap: mediaMap,
            timestamp: new Date().toLocaleTimeString()
        };

        chats.unshift(newChat);
        renderChatList();
        loadChat(newChat.id);

    } catch (err) {
        alert("Erro ao importar: " + err.message);
        console.error(err);
    } finally {
        setTimeout(() => {
            els.loadingOverlay.classList.add('hidden');
        }, 500);
    }
}

// --- PARSER ---
function parseMessages(text, mediaMap) {
    const regex = /^(?:\[?(\d{2}\/\d{2}\/\d{2,4})[,\s-]*(\d{2}:\d{2})(?::\d{2})?\]?)\s*(?:- )?([^:]+): (.*)/;
    const lines = text.split('\n');
    const msgs = [];
    let currentMsg = null;

    lines.forEach(line => {
        line = line.replace(/[\u200e\u200f]/g, '').trim();
        if (!line) return;

        const match = line.match(regex);
        if (match) {
            if (currentMsg) msgs.push(currentMsg);

            const content = match[4];
            const media = findMedia(content, mediaMap);

            currentMsg = {
                date: match[1],
                time: match[2],
                author: match[3],
                content: content,
                media: media,
                isViewOnce: checkViewOnce(content),
                isSystem: false
            };
        } else {
            if (currentMsg) {
                currentMsg.content += '\n' + line;
                if (!currentMsg.media) currentMsg.media = findMedia(line, mediaMap);
            } else {
                if (line.length < 200) msgs.push({ isSystem: true, content: line, date: 'Sistema' });
            }
        }
    });
    if (currentMsg) msgs.push(currentMsg);
    return msgs;
}

function findMedia(text, map) {
    for (let name in map) {
        if (text.includes(name)) {
            let type = 'file';
            if (name.match(/\.(jpg|jpeg|png|webp|gif)$/i)) type = 'image';
            else if (name.match(/\.(mp4|mov)$/i)) type = 'video';
            else if (name.match(/\.(opus|mp3|wav|ogg|m4a)$/i)) type = 'audio';
            return { type, url: map[name], name };
        }
    }
    return null;
}

function checkViewOnce(text) {
    const lower = text.toLowerCase();
    return lower.includes('visualização única') || lower.includes('view once') || lower.includes('imagem ocultada');
}

// --- RENDER ---
function renderChatList() {
    els.chatList.innerHTML = '';
    chats.forEach(chat => {
        const lastMsg = chat.messages.length ? chat.messages[chat.messages.length - 1] : null;
        let preview = 'Sem mensagens';

        if (lastMsg) {
            if (lastMsg.isSystem) preview = "Mensagem do sistema";
            else if (lastMsg.media) preview = `📷 ${lastMsg.media.type}`;
            else preview = lastMsg.content.substring(0, 30);
        }

        const div = document.createElement('div');
        div.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        div.onclick = () => loadChat(chat.id);
        div.innerHTML = `
            <div class="avatar-circle" style="background:${getColor(chat.name)}">${chat.name[0]}</div>
            <div class="chat-info">
                <div class="chat-top">
                    <span class="chat-name">${chat.name}</span>
                    <span class="chat-time">${lastMsg ? lastMsg.time : ''}</span>
                </div>
                <div class="chat-preview">${preview}</div>
            </div>
        `;
        els.chatList.appendChild(div);
    });
}

function loadChat(id) {
    currentChatId = id;
    const chat = chats.find(c => c.id === id);

    // UX Mobile: Fecha sidebar ao selecionar chat
    if (window.innerWidth < 768) {
        els.sidebar.classList.remove('open');
        els.sidebarOverlay.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    }

    els.emptyState.classList.add('hidden');
    els.chatView.classList.remove('hidden');

    document.getElementById('chatTitle').innerText = chat.name;
    document.getElementById('chatSubtitle').innerText = `${chat.messages.length} mensagens`;
    document.getElementById('chatAvatar').innerText = chat.name[0];
    document.getElementById('chatAvatar').style.background = getColor(chat.name);

    renderMessages(chat);
    renderChatList();
    closeInChatSearch();
}

function renderMessages(chat) {
    els.msgContainer.innerHTML = '';
    const myName = chat.owner ? chat.owner.toLowerCase() : null;
    let lastDate = null;

    chat.messages.forEach((msg, idx) => {
        if (msg.date !== lastDate && msg.date !== 'Sistema') {
            const dateDiv = document.createElement('div');
            dateDiv.className = 'date-divider';
            dateDiv.innerText = msg.date;
            els.msgContainer.appendChild(dateDiv);
            lastDate = msg.date;
        }

        const div = document.createElement('div');

        if (msg.isSystem) {
            div.className = 'msg-row';
            div.style.justifyContent = 'center';
            div.innerHTML = `<div class="date-divider" style="background:transparent; color: var(--text-secondary); margin:5px 0;">${msg.content}</div>`;
        } else {
            const msgAuthor = msg.author.toLowerCase();
            const isMe = myName && msgAuthor.includes(myName);

            div.className = `msg-row ${isMe ? 'outgoing' : 'incoming'}`;
            div.setAttribute('data-msg-idx', idx);

            let contentHtml = '';

            // 1. View Once
            if (msg.isViewOnce) {
                contentHtml = `
                    <div class="view-once-card">
                        <div class="view-once-icon">1</div>
                        <span class="view-once-text">Foto de visualização única</span>
                    </div>`;
            }
            // 2. Mídia (Com onClick para Lightbox)
            else {
                if (msg.media) {
                    if (msg.media.type === 'image') {
                        contentHtml += `<div class="media-container" onclick="openLightbox('${msg.media.url}', 'image')">
                            <img src="${msg.media.url}">
                        </div>`;
                    }
                    if (msg.media.type === 'video') {
                        contentHtml += `<div class="media-container" onclick="openLightbox('${msg.media.url}', 'video')">
                            <video src="${msg.media.url}"></video>
                            <span class="material-icons" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:white; font-size:40px; text-shadow:0 0 5px black; pointer-events:none;">play_circle_outline</span>
                        </div>`;
                    }
                    if (msg.media.type === 'audio') {
                        contentHtml += `<audio src="${msg.media.url}" controls class="audio-player"></audio>`;
                    }
                }

                let text = msg.content;
                if (msg.media) {
                    text = text.replace(msg.media.name, '');
                    text = text.replace(/<anexado:.*?>/gi, '');
                    text = text.replace(/<attached:.*?>/gi, '');
                    text = text.replace(/\(arquivo anexado\)/gi, '');
                    text = text.trim();
                }

                if (text) {
                    text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    contentHtml += `<div class="msg-content">${text}</div>`;
                }
            }

            const nameHtml = !isMe ? `<span class="sender-name" style="color: ${getColor(msg.author)}">${msg.author}</span>` : '';

            div.innerHTML = `
                <div class="bubble">
                    ${nameHtml}
                    ${contentHtml}
                    <div class="msg-meta">
                        ${msg.time}
                        ${isMe ? '<span class="material-icons" style="font-size:14px;">done_all</span>' : ''}
                    </div>
                </div>
            `;
        }
        els.msgContainer.appendChild(div);
    });

    scrollToBottom();
}

function scrollToBottom() {
    els.msgContainer.scrollTop = els.msgContainer.scrollHeight;
}

// --- BUSCA ---
function toggleInChatSearch() {
    els.inChatSearch.classList.toggle('open');
    if (els.inChatSearch.classList.contains('open')) els.msgSearchInput.focus();
    else closeInChatSearch();
}

function closeInChatSearch() {
    els.inChatSearch.classList.remove('open');
    els.msgSearchInput.value = '';
    clearHighlights();
}

els.msgSearchInput.addEventListener('input', (e) => performSearch(e.target.value));
els.msgSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') navSearch('down'); });

function performSearch(term) {
    clearHighlights();
    if (!term || term.length < 2) {
        els.searchCount.innerText = "0/0";
        return;
    }

    const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
    const contents = els.msgContainer.querySelectorAll('.msg-content');

    contents.forEach(node => {
        if (node.textContent.match(regex)) {
            node.innerHTML = node.textContent.replace(regex, '<mark>$1</mark>');
        }
    });

    searchResults = document.querySelectorAll('mark');
    els.searchCount.innerText = `${searchResults.length ? 1 : 0}/${searchResults.length}`;

    if (searchResults.length > 0) {
        searchIndex = searchResults.length - 1;
        highlightCurrent();
    }
}

function navSearch(direction) {
    if (!searchResults.length) return;
    if (direction === 'up') {
        searchIndex--;
        if (searchIndex < 0) searchIndex = searchResults.length - 1;
    } else {
        searchIndex++;
        if (searchIndex >= searchResults.length) searchIndex = 0;
    }
    highlightCurrent();
}

function highlightCurrent() {
    searchResults.forEach(m => m.classList.remove('current'));
    const curr = searchResults[searchIndex];
    curr.classList.add('current');
    curr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    els.searchCount.innerText = `${searchIndex + 1}/${searchResults.length}`;
}

function clearHighlights() {
    const marks = document.querySelectorAll('mark');
    marks.forEach(m => {
        const p = m.parentNode;
        p.innerHTML = p.textContent;
    });
    searchResults = [];
    searchIndex = -1;
}

// --- UTILS ---
function getColor(name) {
    if (!name) return '#999';
    const colors = [
        '#e542a3', '#1f7aec', '#008069', '#d62d2d', '#a832a4',
        '#ff8f00', '#007aff', '#e67e22', '#2ecc71', '#34495e'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Filtro lateral
document.getElementById('chatSearchInput').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.chat-item');
    items.forEach(item => {
        const name = item.querySelector('.chat-name').innerText.toLowerCase();
        item.style.display = name.includes(val) ? 'flex' : 'none';
    });
});