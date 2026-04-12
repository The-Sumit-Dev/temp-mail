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
const modalDeleteBtn = document.getElementById('modal-delete-btn');
const modalHeaderContainer = document.getElementById('modal-header-container');

// AI Components (Integrated Inline)
const modalSmartBtn = document.getElementById('modal-smart-btn');
const aiStatusContainer = document.getElementById('ai-status-container');

const apiBase = 'https://sumitbuild.hemlatadevi198.workers.dev';

let inboxMessages = [];

function getBrandIcon(fromAddress) {
    let domain = '';
    const parts = fromAddress.split('@');
    if (parts.length === 2) {
        domain = parts[1].toLowerCase().trim();
    }

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
                await api('/api/messages/purge', { method: 'POST', body: JSON.stringify({ address: state.address }) }).catch(() => { });
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
        await api('/api/messages/purge', { method: 'POST', body: JSON.stringify({ address: emailInput.value }) }).catch(() => { });
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
        await api('/api/messages/purge', { method: 'POST', body: JSON.stringify({ address: emailInput.value }) }).catch(() => { });
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
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        renderInbox();
    } catch (error) {
        console.error(error);
        showNotification('Sync failed: ' + error.message);
    }
}

async function deleteSingleMessage(messageId) {
    if (!confirm('Are you sure you want to delete this email?')) return;
    try {
        showNotification('Deleting...');
        await api('/api/messages/delete', {
            method: 'POST',
            body: JSON.stringify({
                address: emailInput.value,
                id: messageId
            })
        });
        inboxMessages = inboxMessages.filter(m => m.id !== messageId);
        renderInbox();
        closeMessageModal();
        showNotification('Message deleted');
    } catch (error) {
        showNotification('Delete failed: ' + error.message);
    }
}

async function handleAISummary(detail) {
    if (!detail) return;
    
    // Activate Mobile Header Swap
    modalHeaderContainer.classList.add('ai-active');
    
    // UI Feedback: Progressive Dot Animation
    let dots = 0;
    aiStatusContainer.innerHTML = '<span class="ai-detecting">Detecting</span>';
    const statusText = aiStatusContainer.querySelector('.ai-detecting');
    
    const dotInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        statusText.innerText = 'Detecting' + '.'.repeat(dots);
    }, 400);

    modalSmartBtn.disabled = true;

    const rawContent = detail.rawText || detail.snippet || '';
    const content = rawContent.slice(0, 4000);
    const prompt = `Act as an expert verification analyst. Extract any verification code (usually digits) or verification/login link from this email content.
Return the result in this exact format:
Code: [the digits or "None"]
Link: [the full URL or "None"]

Email Content:
${content}`;

    try {
        const response = await api('/api/ai/summarize', {
            method: 'POST',
            body: JSON.stringify({ prompt })
        });
        
        if (response.error) throw new Error(response.error);
        
        const aiResponse = response.content;
        aiStatusContainer.innerHTML = ''; // Clear status

        if (!aiResponse) {
            aiStatusContainer.innerHTML = '<span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">No results</span>';
            return;
        }

        const lines = aiResponse.split('\n');
        let code = 'None';
        let link = 'None';

        lines.forEach(line => {
            const l = line.toLowerCase().trim();
            if (l.startsWith('code:')) code = line.split(':')[1]?.trim() || 'None';
            if (l.startsWith('link:')) link = line.split(':')[1]?.trim() || 'None';
        });

        // Backup parsing for non-standard formats
        if (code === 'None' && aiResponse.match(/\b\d{4,8}\b/)) {
            const match = aiResponse.match(/\b\d{4,8}\b/);
            if (match) code = match[0];
        }

        let found = false;

        if (code !== 'None' && code.length >= 4) {
            const btn = document.createElement('button');
            btn.className = 'ai-header-btn ai-btn-copy';
            btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> COPY CODE: ${code}`;
            btn.onclick = () => {
                navigator.clipboard.writeText(code);
                showNotification('Code Copied!');
            };
            aiStatusContainer.appendChild(btn);
            found = true;
        }

        if (link !== 'None' && link.startsWith('http')) {
            const btn = document.createElement('button');
            btn.className = 'ai-header-btn ai-btn-link';
            btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg> OPEN LINK`;
            btn.onclick = () => window.open(link, '_blank');
            aiStatusContainer.appendChild(btn);
            found = true;
        }

        if (!found) {
            aiStatusContainer.innerHTML = '<span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">No any verification code or verification link detected.</span>';
        }

    } catch (err) {
        console.error('AI Error:', err);
        aiStatusContainer.innerHTML = '<span class="text-[9px] font-bold text-red-400 uppercase tracking-widest">Scan Failed</span>';
    } finally {
        clearInterval(dotInterval);
        modalSmartBtn.disabled = false;
    }
}

function openMessage(messageId) {
    try {
        const detail = inboxMessages.find((m) => m.id === messageId);
        if (!detail) {
            showNotification('Syncing...');
            refreshInbox();
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

        // Setup Buttons
        modalDeleteBtn.onclick = () => deleteSingleMessage(messageId);
        
        // Reset Header State
        modalHeaderContainer.classList.remove('ai-active');
        modalHeaderContainer.classList.remove('info-expanded');
        
        // Reset AI Status Container for new message
        aiStatusContainer.innerHTML = '';
        modalSmartBtn.classList.remove('hidden');
        modalSmartBtn.classList.remove('animate-pulse');
        modalSmartBtn.disabled = false;
        modalSmartBtn.onclick = () => handleAISummary(detail);

        messageModal.classList.remove('hidden');
        messageModal.classList.add('flex');
        setTimeout(() => messageModal.classList.remove('opacity-0'), 10);
    } catch (error) {
        showNotification('Unable to open message');
    }
}

function toggleFullInfo() {
    if (window.innerWidth >= 640) return; // Only for mobile
    modalHeaderContainer.classList.toggle('info-expanded');
}

function closeMessageModal() {
    messageModal.classList.add('opacity-0');
    setTimeout(() => {
        messageModal.classList.remove('flex');
        messageModal.classList.add('hidden');
        aiStatusContainer.innerHTML = ''; 
        modalHeaderContainer.classList.remove('ai-active');
        modalHeaderContainer.classList.remove('info-expanded');
    }, 300);
}

function onModalBackdrop(event) {
    if (event.target === messageModal) {
        closeMessageModal();
    }
}

async function deleteAll() {
    if (!confirm('Are you sure you want to delete ALL messages?')) return;
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
        systemStatus.innerText = 'Offline';
        showNotification('Check connection or backend');
        renderInbox();
    }
})();
