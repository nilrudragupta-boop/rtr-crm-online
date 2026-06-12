document.addEventListener('DOMContentLoaded', () => {
    Chatter.init();
});

function escapeHtml(unsafe) {
    return (unsafe || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url.replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
}

function highlightMentions(text) {
    // Regex ensures we only highlight @mentions that start at the beginning of a word to avoid breaking URLs
    const mentionRegex = /(^|\s)(@[\w.-]+)/g;
    return text.replace(mentionRegex, function(match, space, mention) {
        return `${space}<span class="mention-highlight">${mention}</span>`;
    });
}

const Chatter = {
    currentUser: localStorage.getItem('currentUser') || 'Unknown User',
    messages: [],
    selectedFile: null,
    pollInterval: null,
    editingMessageId: null,
    replyingToMessageId: null,
    searchQuery: '',
    typingTimeout: null,

    init: async function() {
        document.getElementById('current-user-display').innerHTML = `<i class="fas fa-user-circle me-1"></i> ${this.currentUser}`;
        
        document.getElementById('btn-send').addEventListener('click', () => this.sendMessage());
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        document.getElementById('chat-input').addEventListener('input', () => {
            if (typeof apiClient !== 'undefined' && apiClient.setTypingStatus) {
                apiClient.setTypingStatus(this.currentUser, true);
                clearTimeout(this.typingTimeout);
                this.typingTimeout = setTimeout(() => {
                    apiClient.setTypingStatus(this.currentUser, false);
                }, 3000);
            }
        });

        document.getElementById('btn-attach').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        document.getElementById('file-input').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.selectedFile = e.target.files[0];
                document.getElementById('file-name-text').innerText = this.selectedFile.name;
                document.getElementById('attachment-name').style.display = 'block';
                document.getElementById('chat-input').focus();
            }
        });

        document.getElementById('btn-remove-file').addEventListener('click', () => {
            this.clearAttachment();
        });

        document.getElementById('btn-cancel-edit').addEventListener('click', () => {
            this.cancelEdit();
        });

        document.getElementById('btn-cancel-reply').addEventListener('click', () => {
            this.cancelReply();
        });

        document.getElementById('scroll-bottom-btn').addEventListener('click', () => {
            this.scrollToBottom();
        });

        document.getElementById('chat-messages').addEventListener('scroll', (e) => {
            const container = e.target;
            const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 150;
            const btn = document.getElementById('scroll-bottom-btn');
            btn.style.display = isNearBottom ? 'none' : 'flex';
        });

        document.getElementById('chat-search').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.trim().toLowerCase();
            this.renderMessages();
        });

        await this.loadMessages();
        this.scrollToBottom();

        // Poll every 5 seconds to get updates continuously
        this.pollInterval = setInterval(() => this.loadMessages(true), 5000);
    },

    clearAttachment: function() {
        this.selectedFile = null;
        document.getElementById('file-input').value = '';
        document.getElementById('attachment-name').style.display = 'none';
    },

    cancelEdit: function() {
        this.editingMessageId = null;
        document.getElementById('edit-mode-banner').style.display = 'none';
        document.getElementById('chat-input').value = '';
        document.getElementById('btn-send').innerHTML = '<i class="fas fa-paper-plane me-1"></i> Send';
        this.clearAttachment();
    },

    cancelReply: function() {
        this.replyingToMessageId = null;
        document.getElementById('reply-mode-banner').style.display = 'none';
    },

    replyToMessage: function(id) {
        const msg = this.messages.find(m => m.id === id);
        if (!msg) return;
        
        this.replyingToMessageId = id;
        document.getElementById('reply-to-user').innerText = msg.sender;
        document.getElementById('reply-to-text').innerText = msg.text || (msg.attachmentName ? 'Attachment: ' + msg.attachmentName : 'Message');
        document.getElementById('reply-mode-banner').style.display = 'block';
        
        this.cancelEdit(); // Mutually exclusive UI states
        document.getElementById('chat-input').focus();
    },

    loadMessages: async function(isPolling = false) {
        if (typeof apiClient !== 'undefined' && apiClient.getMessages) {
            const data = await apiClient.getMessages();
            if (data && Array.isArray(data)) {
                const oldLength = this.messages.length;
                this.messages = data;
                this.renderMessages();
                
                const container = document.getElementById('chat-messages');
                const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
                
                // Only auto scroll to bottom if manually loaded, or if user is already browsing near the end of the chat
                if (!isPolling || (this.messages.length > oldLength && isNearBottom)) {
                    this.scrollToBottom();
                }

                // Mark messages as read for OS notifications
                localStorage.setItem('lastChatterCheck', Date.now());
            } else if (!isPolling) {
                document.getElementById('chat-messages').innerHTML = '<div class="text-center text-muted my-3">No messages yet. Be the first to start the coordination!</div>';
            }
        }

        // Check typing status
        if (typeof apiClient !== 'undefined' && apiClient.getTypingStatus) {
            const tStatus = await apiClient.getTypingStatus();
            if (tStatus && tStatus.success) {
                const othersTyping = (tStatus.typing || []).filter(u => u !== this.currentUser);
                const typingBlock = document.getElementById('typing-indicator');
                if (typingBlock) {
                    if (othersTyping.length > 0) {
                        typingBlock.innerText = othersTyping.join(', ') + (othersTyping.length > 1 ? ' are typing...' : ' is typing...');
                        typingBlock.style.display = 'block';
                    } else {
                        typingBlock.style.display = 'none';
                    }
                }
            }
        }
    },

    sendMessage: async function() {
        const textInput = document.getElementById('chat-input');
        const text = textInput.value.trim();

        if (!text && !this.selectedFile) return;

        const sendBtn = document.getElementById('btn-send');
        const ogText = sendBtn.innerHTML;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.disabled = true;
        textInput.disabled = true;

        if (this.editingMessageId) {
            const msgIndex = this.messages.findIndex(m => m.id === this.editingMessageId);
            if (msgIndex !== -1) {
                this.messages[msgIndex].text = text;
                this.renderMessages();
                
                if (typeof apiClient !== 'undefined' && apiClient.saveMessage) {
                    await apiClient.saveMessage(this.messages[msgIndex]);
                }
            }
            this.cancelEdit();
            sendBtn.disabled = false;
            textInput.disabled = false;
            textInput.focus();
            return;
        }

        let attachmentBase64 = null;
        let attachmentName = null;

        if (this.selectedFile) {
            try {
                attachmentBase64 = await this.toBase64(this.selectedFile);
                attachmentName = this.selectedFile.name;
            } catch (e) {
                alert("Error reading file: " + e.message);
                sendBtn.innerHTML = ogText;
                sendBtn.disabled = false;
                textInput.disabled = false;
                return;
            }
        }

        let replyToData = null;
        if (this.replyingToMessageId) {
            const replyMsg = this.messages.find(m => m.id === this.replyingToMessageId);
            if (replyMsg) {
                replyToData = {
                    id: replyMsg.id,
                    sender: replyMsg.sender,
                    text: replyMsg.text || (replyMsg.attachmentName ? 'Attachment: ' + replyMsg.attachmentName : 'Message')
                };
            }
        }

        const newMessage = {
            id: 'MSG-' + Date.now(),
            sender: this.currentUser,
            text: text,
            attachment: attachmentBase64,
            attachmentName: attachmentName,
            replyTo: replyToData,
            createdAt: new Date().toISOString()
        };

        this.messages.push(newMessage);
        this.renderMessages();
        this.scrollToBottom();

        textInput.value = '';
        this.clearAttachment();
        this.cancelReply();

        if (typeof apiClient !== 'undefined' && apiClient.saveMessage) {
            await apiClient.saveMessage(newMessage);
        }

        sendBtn.innerHTML = ogText;
        sendBtn.disabled = false;
        textInput.disabled = false;
        textInput.focus();
    },

    editMessage: function(id) {
        const msg = this.messages.find(m => m.id === id);
        if (!msg) return;
        
        this.cancelReply(); // Mutually exclusive UI states
        document.getElementById('chat-input').value = msg.text;
        this.editingMessageId = id;
        document.getElementById('edit-mode-banner').style.display = 'block';
        document.getElementById('chat-input').focus();
        document.getElementById('btn-send').innerHTML = '<i class="fas fa-save me-1"></i> Update';
    },

    deleteMessage: async function(id) {
        if (!confirm("Are you sure you want to delete this message?")) return;
        
        this.messages = this.messages.filter(m => m.id !== id);
        this.renderMessages();
        
        if (typeof apiClient !== 'undefined' && apiClient.deleteMessage) {
            await apiClient.deleteMessage(id);
        }
    },

    toBase64: function(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    },

    renderMessages: function() {
        const container = document.getElementById('chat-messages');
        if (this.messages.length === 0) {
            container.innerHTML = '<div class="text-center text-muted my-3">No messages yet. Be the first to start the coordination!</div>';
            return;
        }
        
        container.innerHTML = '';

        let filteredMessages = this.messages;
        if (this.searchQuery) {
            filteredMessages = this.messages.filter(msg => 
                (msg.text && msg.text.toLowerCase().includes(this.searchQuery)) ||
                (msg.sender && msg.sender.toLowerCase().includes(this.searchQuery)) ||
                (msg.attachmentName && msg.attachmentName.toLowerCase().includes(this.searchQuery))
            );
        }
        if (filteredMessages.length === 0) {
            container.innerHTML = '<div class="text-center text-muted my-3">No messages match your search.</div>';
            return;
        }

        filteredMessages.forEach(msg => {
            const isMe = msg.sender === this.currentUser;
            const msgDiv = document.createElement('div');
            msgDiv.className = `message-box ${isMe ? 'message-me' : 'message-other'}`;
            msgDiv.id = 'msg-' + msg.id; // Assign ID to smoothly scroll to it if clicked from a reply

            let attachmentHtml = '';
            if (msg.attachment) {
                if (msg.attachment.startsWith('data:image')) {
                    attachmentHtml = `<div class="mt-2"><img src="${msg.attachment}" class="attachment-preview" onclick="window.open('${msg.attachment}', '_blank')" style="cursor:pointer;" title="Click to view full size"></div>`;
                } else {
                    attachmentHtml = `<div class="mt-2"><a href="${msg.attachment}" download="${escapeHtml(msg.attachmentName) || 'Attachment'}" class="btn btn-sm ${isMe ? 'btn-light text-primary' : 'btn-primary'}"><i class="fas fa-download me-1"></i> ${escapeHtml(msg.attachmentName) || 'Download File'}</a></div>`;
                }
            }

            let d = new Date(msg.createdAt || msg.created_at);
            if (isNaN(d.getTime())) d = new Date();
            const timeString = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            let actionHtml = `
                <div class="message-actions">
                    <button onclick="Chatter.replyToMessage('${msg.id}')" title="Reply"><i class="fas fa-reply"></i></button>
                    ${isMe ? `
                    <button onclick="Chatter.editMessage('${msg.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                    <button onclick="Chatter.deleteMessage('${msg.id}')" title="Delete"><i class="fas fa-trash"></i></button>
                    ` : ''}
                </div>
            `;

            let replyHtml = '';
            if (msg.replyTo) {
                replyHtml = `
                <div class="reply-quote shadow-sm" onclick="document.getElementById('msg-${msg.replyTo.id}')?.scrollIntoView({behavior: 'smooth', block: 'center'})" title="Click to view original message">
                    <strong><i class="fas fa-reply me-1"></i> ${escapeHtml(msg.replyTo.sender)}</strong><br>
                    <span class="text-truncate d-inline-block" style="max-width:100%;">${escapeHtml(msg.replyTo.text)}</span>
                </div>`;
            }

            msgDiv.innerHTML = `
                ${!isMe ? `<div class="message-sender">${escapeHtml(msg.sender)}</div>` : ''}
                <div class="message-content shadow-sm">
                    ${replyHtml}
                    ${msg.text ? `<div>${linkify(highlightMentions(escapeHtml(msg.text))).replace(/\n/g, '<br>')}</div>` : ''}
                    ${attachmentHtml}
                    <span class="message-time">${timeString}</span>
                    ${actionHtml}
                </div>
            `;

            container.appendChild(msgDiv);
        });
    },

    scrollToBottom: function() {
        const container = document.getElementById('chat-messages');
        container.scrollTop = container.scrollHeight;
    }
};