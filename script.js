const emailInput = document.getElementById('email-address');
const customPrefixInput = document.getElementById('custom-prefix');
const notification = document.getElementById('notification');
const notificationText = document.getElementById('notification-text');
const emailList = document.getElementById('email-list');
const systemStatus = document.getElementById('system-status');
const messageModal = document.getElementById('message-modal');
const modalFrom = document.getElementById('modal-from');
const modalSubject = document.getElementById('modal-subject');
const modalTime = document.getElementById('modal-time');
const modalBody = document.getElementById('modal-body');

const apiBase = 'https://sumitbuild.hemlatadevi198.workers.dev';
let inboxMessages = [];

function getBrandIcon(fromAddress) {
    let domain = '';
    const parts = fromAddress.split('@');
    if (parts.length === 2) {
        domain = parts[1].toLowerCase().trim();
    }
    
    // Normalize domains for robust specific icon fetching
    if (domain.includes('facebookmail.com') || domain.includes('facebook.com')) domain = 'facebook.com';
    else if (domain.includes('instagram.com')) domain = 'instagram.com';
    else if (domain.includes('google.com') || domain.includes('gmail.com')) domain = 'google.com';
    else if (domain.includes('linkedin.com')) domain = 'linkedin.com';
    else if (domain.includes('cloudflare.com')) domain = 'cloudflare.com';
    else if (domain.includes('github.com')) domain = 'github.com';
    else if (domain.includes('microsoft.com') || domain.includes('outlook.com')) domain = 'microsoft.com';
    else if (domain.includes('apple.com') || domain.includes('icloud.com')) domain = 'apple.com';
    else if (domain.includes('ollama.com') || domain.includes('ollama.ai')) domain = 'ollama.com';

    const fallbackSvg = `
        <div class="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400 absolute inset-0 z-0">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
        </div>`;

    if (!domain) {
        return `<div class="w-10 h-10 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center shrink-0 shadow-sm border border-gray-200 relative">${fallbackSvg}</div>`;
    }

    const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    const imageTag = `<img src="${iconUrl}" onerror="this.style.opacity='0'" class="w-full h-full object-cover z-10 bg-white relative" alt="${domain}" />`;

    return `<div class="w-10 h-10 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center shrink-0 shadow-sm border border-gray-200 relative">
        ${fallbackSvg}
        ${imageTag}
    </div>`;
}

function showNotification(text) {
    notificationText.innerText = text;
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 2500);
}

async function api(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        ...options
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Request failed');
    }
    return response.json();
}

function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
}

function escapeHtml(text = '') {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderInbox() {
    if (!inboxMessages.length) {
        emailList.innerHTML = `
            <div class="py-32 flex flex-col items-center justify-center text-gray-400">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mb-4 opacity-70"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                <span class="text-[12px] font-black tracking-[0.2em] opacity-80 uppercase">No Messages Received</span>
            </div>
        `;
        return;
    }

    emailList.innerHTML = inboxMessages.map((message) => {
        return `
            <div onclick="openMessage('${message.id}')" class="flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-4 px-6 md:px-8 py-6 hover:bg-white/[0.02] cursor-pointer group transition-all">
                <div class="md:col-span-4 flex items-center gap-4">
                    ${getBrandIcon(message.rawAddress)}
                    <div class="flex flex-col min-w-0">
                        <span class="font-bold text-sm text-gray-900">${escapeHtml(message.sender)}</span>
                        <span class="text-[10px] text-gray-500 font-bold uppercase tracking-tight truncate">${escapeHtml(message.from)}</span>
                    </div>
                    <span class="md:hidden ml-auto text-[10px] text-gray-500 font-black">${escapeHtml(message.time)}</span>
                </div>
                <div class="md:col-span-8 flex justify-between items-start mt-2 md:mt-0 min-w-0">
                    <div class="flex flex-col pr-4 min-w-0 flex-1">
                        <span class="font-bold text-sm text-gray-700 mb-0.5 truncate">${escapeHtml(message.subject)}</span>
                        <span class="text-xs text-gray-500 line-clamp-1 md:line-clamp-2 leading-relaxed break-all">${escapeHtml(message.snippet)}</span>
                    </div>
                    <div class="hidden md:flex items-center gap-4 shrink-0 pt-1">
                        <span class="text-[10px] text-gray-500 font-black whitespace-nowrap shrink-0">${escapeHtml(message.time)}</span>
                        <svg class="text-gray-400 group-hover:text-gray-900 transition-colors shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function copyEmail() {
    emailInput.select();
    emailInput.setSelectionRange(0, 99999);
    try {
        const tempInput = document.createElement('input');
        tempInput.value = emailInput.value;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        showNotification('Address Copied!');
    } catch (err) {
        console.error('Failed to copy', err);
    }
}

async function refreshEmail() {
    await refreshInbox();
}

async function ensureAccount() {
    try {
        const localSession = localStorage.getItem('tempmail_session');
        if (localSession) {
            const state = JSON.parse(localSession);
            const ageMs = Date.now() - new Date(state.createdAt).getTime();
            if (ageMs > 24 * 60 * 60 * 1000) {
                await api('/api/messages/purge', { method: 'POST', body: JSON.stringify({ address: state.address }) }).catch(() => {});
                localStorage.removeItem('tempmail_session');
            } else {
                emailInput.value = state.address;
                systemStatus.innerText = 'System Online';
                return state;
            }
        }
        const created = await api('/api/account/new', { method: 'POST', body: JSON.stringify({}) });
        localStorage.setItem('tempmail_session', JSON.stringify(created));
        emailInput.value = created.address;
        systemStatus.innerText = 'System Online';
        showNotification('Mailbox Ready');
        return created;
    } catch (error) {
        const created = await api('/api/account/new', { method: 'POST', body: JSON.stringify({}) });
        emailInput.value = created.address;
        systemStatus.innerText = 'System Online';
        return created;
    }
}

async function newEmail() {
    try {
        await api('/api/messages/purge', { method: 'POST', body: JSON.stringify({ address: emailInput.value }) }).catch(() => {});
        const created = await api('/api/account/new', { method: 'POST', body: JSON.stringify({}) });
        localStorage.setItem('tempmail_session', JSON.stringify(created));
        emailInput.value = created.address;
        inboxMessages = [];
        renderInbox();
        showNotification('New Address Active');
    } catch (error) {
        showNotification('Unable to create mailbox');
    }
}

async function setCustomEmail() {
    const prefix = customPrefixInput.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (prefix.length < 3) {
        showNotification('Handle too short.');
        return;
    }

    try {
        await api('/api/messages/purge', { method: 'POST', body: JSON.stringify({ address: emailInput.value }) }).catch(() => {});
        const created = await api('/api/account/custom', {
            method: 'POST',
            body: JSON.stringify({ prefix })
        });
        localStorage.setItem('tempmail_session', JSON.stringify(created));
        emailInput.value = created.address;
        customPrefixInput.value = '';
        inboxMessages = [];
        renderInbox();
        showNotification('Identity Updated');
    } catch (error) {
        showNotification('Alias unavailable');
    }
}

async function refreshInbox() {
    try {
        const targetAddress = encodeURIComponent(emailInput.value);
        showNotification('Syncing Inbox...');
        const payload = await api('/api/messages?address=' + targetAddress);
        inboxMessages = payload.messages.map((message) => {
            const senderName = message.from?.name || message.from?.address || 'Unknown Sender';
            const fromAddress = message.from?.address ? `@${message.from.address.split('@').pop()}` : '@unknown';
            const snippet = (message.intro || '').trim() || 'Open to read full message.';
            const rawAddr = message.from?.address || '';
            return {
                id: message.id,
                sender: senderName,
                from: fromAddress,
                rawAddress: rawAddr,
                subject: message.subject || 'No Subject',
                snippet,
                rawText: message.text || '',
                rawHtml: message.html || '',
                time: formatRelativeTime(message.createdAt || new Date().toISOString()),
                createdAt: message.createdAt || new Date().toISOString()
            };
        });
        renderInbox();
    } catch (error) {
        console.error(error);
        showNotification('Sync failed: ' + error.message);
    }
}

function openMessage(messageId) {
    try {
        const detail = inboxMessages.find((m) => m.id === messageId);
        if (!detail) {
            showNotification('Message missing locally, refresh inbox');
            return;
        }
        
        modalFrom.innerText = detail.sender;
        modalSubject.innerText = detail.subject || 'No Subject';
        modalTime.innerText = detail.time;
        
        const rawHtml = detail.rawHtml || '';
        const rawText = detail.rawText || '';

        modalBody.innerHTML = ''; 
        
        if (rawHtml.trim()) {
            const iframe = document.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.height = '70vh';
            iframe.style.border = 'none';
            iframe.style.display = 'block';
            modalBody.appendChild(iframe);
            iframe.srcdoc = rawHtml;
        } else {
            const div = document.createElement('div');
            div.className = 'p-8 text-base text-gray-800 leading-relaxed whitespace-pre-wrap font-sans';
            div.innerText = rawText.trim() || 'No message body available.';
            modalBody.appendChild(div);
        }

        const smartBtn = document.getElementById('modal-smart-btn');
        smartBtn.classList.add('hidden');
        smartBtn.onclick = null;
        
        const fallbackTextForLinks = rawText || rawHtml;
        const linkMatch = fallbackTextForLinks.match(/https?:\/\/[^\s"'>]+/);
        const codeMatch = fallbackTextForLinks.match(/\b(\d{4,8})\b/);
        
        if (linkMatch) {
            smartBtn.classList.remove('hidden');
            smartBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="inline w-3 h-3 mr-1 -mt-0.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg> OPEN LINK`;
            smartBtn.onclick = () => window.open(linkMatch[0], '_blank');
        } else if (codeMatch && codeMatch[1].length > 3) {
            smartBtn.classList.remove('hidden');
            smartBtn.innerHTML = `COPY CODE: <span class="bg-blue-500/20 px-1 py-0.5 rounded ml-1 text-blue-300">${codeMatch[1]}</span>`;
            smartBtn.onclick = () => {
                navigator.clipboard.writeText(codeMatch[1]);
                smartBtn.innerHTML = 'COPIED!';
            };
        }

        messageModal.classList.remove('hidden');
        messageModal.classList.add('flex');
        setTimeout(() => messageModal.classList.remove('opacity-0'), 10);
    } catch (error) {
        showNotification('Unable to open message');
    }
}

function closeMessageModal() {
    messageModal.classList.add('opacity-0');
    setTimeout(() => {
        messageModal.classList.remove('flex');
        messageModal.classList.add('hidden');
    }, 300);
}

function onModalBackdrop(event) {
    if (event.target === messageModal) {
        closeMessageModal();
    }
}

async function deleteAll() {
    try {
        await api('/api/messages/purge', { method: 'POST', body: JSON.stringify({ address: emailInput.value }) });
        inboxMessages = [];
        renderInbox();
        showNotification('Inbox Purged');
    } catch (error) {
        showNotification('Unable to purge inbox');
    }
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeMessageModal();
    }
});

(async () => {
    try {
        await ensureAccount();
        await refreshInbox();
    } catch (error) {
        systemStatus.innerText = 'Backend Offline';
        showNotification('Start local backend first');
        renderInbox();
    }
})();
