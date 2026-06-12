document.addEventListener('DOMContentLoaded', () => {
    Chatter.init();
});

function escapeHtml(unsafe) {
    return (unsafe || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function (url) {
        return `<a href="${url.replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
}

function highlightMentions(text) {
    // Regex ensures we only highlight @mentions that start at the beginning of a word to avoid breaking URLs
    const mentionRegex = /(^|\s)(@[\w.-]+)/g;
    return text.replace(mentionRegex, function (match, space, mention) {
        return `${space}<span class="mention-highlight">${mention}</span>`;
    });
}

function isOnlyEmojis(str) {
    if (!str) return false;
    const stripped = str.replace(/[\s\n]/g, ''); // Remove spaces and line breaks
    if (stripped.length === 0) return false;
    // Matches Standard Emojis, Flags, Skin Tones, and zero-width joiners
    return /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}\p{Regional_Indicator}\uFE0F\u200D]+$/u.test(stripped);
}

const Chatter = {
    currentUser: localStorage.getItem('currentUser') || 'Unknown User',
    activeGroupId: 'global',
    groups: [],
    allUsers: [],
    messages: [],
    unreadCounts: {},
    selectedFile: null,
    pollInterval: null,
    editingMessageId: null,
    editingGroupId: null,
    replyingToMessageId: null,
    searchQuery: '',
    typingTimeout: null,
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    activeReactionMsgId: null,

    init: async function () {
        document.getElementById('current-user-display').innerHTML = `<i class="fas fa-user-circle me-1"></i> ${this.currentUser}`;

        let tenantName = 'Global';
        if (typeof apiClient !== 'undefined' && apiClient.getTenantId) {
            tenantName = await apiClient.getTenantId();
        }
        this.tenantName = tenantName; // Store it for later use

        const titleEl = document.getElementById('active-group-title');
        if (titleEl && this.activeGroupId === 'global') {
            titleEl.innerHTML = `<i class="fas fa-globe me-1"></i> ${this.tenantName} Coordination`;
        }

        if (typeof apiClient !== 'undefined' && apiClient.getAdminCreds) {
            const creds = await apiClient.getAdminCreds();
            if (creds && creds.adminUsers) {
                this.allUsers = creds.adminUsers.map(u => u.username);
            }
        }

        if (!this.allUsers.includes('DEVELOPER')) {
            this.allUsers.push('DEVELOPER');
        }

        await this.loadGroups();
        document.getElementById('btn-send').addEventListener('click', () => this.sendMessage());
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        document.getElementById('chat-input').addEventListener('input', (e) => {
            if (typeof apiClient !== 'undefined' && apiClient.setTypingStatus) {
                apiClient.setTypingStatus(this.currentUser, true);
                clearTimeout(this.typingTimeout);
                this.typingTimeout = setTimeout(() => {
                    apiClient.setTypingStatus(this.currentUser, false);
                }, 3000);
            }

            // Mention autocomplete logic
            const val = e.target.value;
            const cursorPos = e.target.selectionStart;
            const textBeforeCursor = val.substring(0, cursorPos);
            const match = textBeforeCursor.match(/(?:^|\s)@([\w.-]*)$/);

            if (match) {
                const search = match[1].toLowerCase();
                let availableUsers = this.allUsers;
                if (this.activeGroupId !== 'global') {
                    const group = this.groups.find(g => g.id === this.activeGroupId);
                    if (group) availableUsers = group.members;
                }

                const filtered = availableUsers.filter(u => u !== this.currentUser && u.toLowerCase().includes(search));
                this.renderMentionDropdown(filtered);
            } else {
                const dropdown = document.getElementById('mention-dropdown');
                if (dropdown) dropdown.style.display = 'none';
            }
        });

        // Hide dropdown when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#mention-dropdown') && e.target.id !== 'chat-input') {
                const dropdown = document.getElementById('mention-dropdown');
                if (dropdown) dropdown.style.display = 'none';
            }
            if (!e.target.closest('#reactionPicker') && !e.target.closest('.btn-react')) {
                document.getElementById('reactionPicker').style.display = 'none';
            }
        });

        document.getElementById('btn-attach').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        document.getElementById('btn-record').addEventListener('click', () => {
            this.toggleRecording();
        });

        document.getElementById('file-input').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                if (file.size > 2 * 1024 * 1024) { // 2MB Limit
                    alert("File is too large! Please attach a file smaller than 2MB.");
                    e.target.value = '';
                    return;
                }
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

        // Drag and drop support
        const chatArea = document.querySelector('.main-chat-area');
        const dragOverlay = document.getElementById('drag-overlay');
        let dragCounter = 0;

        if (chatArea && dragOverlay) {
            chatArea.addEventListener('dragenter', (e) => {
                e.preventDefault();
                dragCounter++;
                dragOverlay.style.display = 'flex';
            });
            chatArea.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            chatArea.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dragCounter--;
                if (dragCounter <= 0) {
                    dragCounter = 0;
                    dragOverlay.style.display = 'none';
                }
            });
            chatArea.addEventListener('drop', (e) => {
                e.preventDefault();
                dragCounter = 0;
                dragOverlay.style.display = 'none';

                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    const file = e.dataTransfer.files[0];
                    if (file.size > 2 * 1024 * 1024) { // 2MB Limit
                        alert("File is too large! Please attach a file smaller than 2MB.");
                        return;
                    }
                    this.selectedFile = file;
                    document.getElementById('file-name-text').innerText = file.name;
                    document.getElementById('attachment-name').style.display = 'block';
                    document.getElementById('chat-input').focus();
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
                const md = document.getElementById('mention-dropdown');
                if (md) md.style.display = 'none';
                const rp = document.getElementById('reactionPicker');
                if (rp) rp.style.display = 'none';
            }
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

    loadGroups: async function () {
        if (typeof apiClient !== 'undefined' && apiClient.getChatterGroups) {
            this.groups = await apiClient.getChatterGroups() || [];
        }
        this.renderGroups();
    },

    renderGroups: function () {
        const groupList = document.getElementById('group-list');
        if (!groupList) return;

        const tenantName = this.tenantName || 'Global';

        groupList.innerHTML = '';
        const globalActive = this.activeGroupId === 'global' ? 'active' : '';
        const globalUnread = this.unreadCounts['global'] ? `<span class="badge bg-danger rounded-pill">${this.unreadCounts['global']}</span>` : '';
        groupList.innerHTML += `<div class="group-item ${globalActive}" onclick="Chatter.switchGroup('global')"><span><i class="fas fa-globe text-primary me-2"></i> ${tenantName} Coordination</span>${globalUnread}</div>`;

        this.groups.forEach(g => {
            if (g.members && g.members.includes(this.currentUser)) {
                const isActive = this.activeGroupId === g.id ? 'active' : '';
                const unread = this.unreadCounts[g.id] ? `<span class="badge bg-danger rounded-pill">${this.unreadCounts[g.id]}</span>` : '';
                groupList.innerHTML += `<div class="group-item ${isActive}" onclick="Chatter.switchGroup('${g.id}')"><span><i class="fas fa-users text-success me-2"></i> ${escapeHtml(g.name)}</span>${unread}</div>`;
            }
        });
    },

    switchGroup: function (groupId) {
        this.activeGroupId = groupId;
        this.unreadCounts[groupId] = 0;
        this.renderGroups();

        const tenantName = this.tenantName || 'Global';

        const titleEl = document.getElementById('active-group-title');
        const leaveBtn = document.getElementById('btn-leave-group');
        const editBtn = document.getElementById('btn-edit-group');
        const viewMembersBtn = document.getElementById('btn-view-members');
        if (titleEl) {
            if (groupId === 'global') {
                titleEl.innerHTML = `<i class="fas fa-globe me-1"></i> ${tenantName} Coordination`;
                if (leaveBtn) leaveBtn.style.display = 'none';
                if (editBtn) editBtn.style.display = 'none';
                if (viewMembersBtn) viewMembersBtn.style.display = 'inline-block';
            } else {
                const g = this.groups.find(g => g.id === groupId);
                titleEl.innerHTML = `<i class="fas fa-users me-1"></i> ${escapeHtml(g ? g.name : 'Unknown Group')}`;
                if (leaveBtn) leaveBtn.style.display = 'inline-block';
                if (editBtn) editBtn.style.display = 'inline-block';
                if (viewMembersBtn) viewMembersBtn.style.display = 'inline-block';
            }
        }

        this.messages = [];
        document.getElementById('chat-messages').innerHTML = '<div class="text-center text-muted my-3"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';
        this.loadMessages();
    },

    openCreateGroupModal: function () {
        this.editingGroupId = null;
        document.getElementById('newGroupName').value = '';
        document.getElementById('newGroupName').disabled = false;

        const searchInput = document.getElementById('memberSearch');
        if (searchInput) searchInput.value = '';
        const list = document.getElementById('groupMembersList');
        list.innerHTML = '';

        document.getElementById('createGroupModalTitle').innerHTML = '<i class="fas fa-users-cog text-primary me-2"></i>Create New Group';
        const btn = document.getElementById('createGroupBtn');
        btn.innerText = 'Create Group';
        btn.onclick = () => Chatter.createGroup();

        this.allUsers.forEach(u => {
            if (u !== this.currentUser) {
                list.innerHTML += `
                    <div class="form-check member-item-container">
                        <input class="form-check-input group-member-cb" type="checkbox" value="${escapeHtml(u)}" id="user_${escapeHtml(u)}">
                        <label class="form-check-label" for="user_${escapeHtml(u)}" style="cursor: pointer;">${escapeHtml(u)}</label>
                    </div>
                `;
            }
        });
        document.getElementById('createGroupModal').style.display = 'flex';
    },

    openEditGroupModal: function () {
        const group = this.groups.find(g => g.id === this.activeGroupId);
        if (!group) return;

        this.editingGroupId = group.id;
        document.getElementById('newGroupName').value = group.name;

        const searchInput = document.getElementById('memberSearch');
        if (searchInput) searchInput.value = '';
        const list = document.getElementById('groupMembersList');
        list.innerHTML = '';

        this.allUsers.forEach(u => {
            if (u !== this.currentUser) {
                const isMember = group.members.includes(u);
                list.innerHTML += `
                    <div class="form-check member-item-container">
                        <input class="form-check-input group-member-cb" type="checkbox" value="${escapeHtml(u)}" id="user_${escapeHtml(u)}" ${isMember ? 'checked' : ''}>
                        <label class="form-check-label" for="user_${escapeHtml(u)}" style="cursor: pointer;">${escapeHtml(u)}</label>
                    </div>
                `;
            }
        });

        document.getElementById('createGroupModalTitle').innerHTML = '<i class="fas fa-users-cog text-primary me-2"></i>Manage Group';
        const btn = document.getElementById('createGroupBtn');
        btn.innerText = 'Save Changes';
        btn.onclick = () => Chatter.updateGroup();

        document.getElementById('createGroupModal').style.display = 'flex';
    },

    filterMembers: function () {
        const term = document.getElementById('memberSearch').value.toLowerCase();
        const items = document.querySelectorAll('.member-item-container');
        items.forEach(item => {
            const label = item.innerText.toLowerCase();
            item.style.display = label.includes(term) ? 'block' : 'none';
        });
    },

    leaveCurrentGroup: async function () {
        if (this.activeGroupId === 'global') return;
        if (!confirm("Are you sure you want to leave this group?")) return;

        const groupIndex = this.groups.findIndex(g => g.id === this.activeGroupId);
        if (groupIndex !== -1) {
            let group = this.groups[groupIndex];
            group.members = group.members.filter(m => m !== this.currentUser);

            if (typeof apiClient !== 'undefined') {
                if (group.members.length === 0) {
                    await apiClient.deleteChatterGroup(group.id);
                } else {
                    await apiClient.saveChatterGroup(group);
                }
            }

            this.switchGroup('global');
        }
    },

    createGroup: async function () {
        const name = document.getElementById('newGroupName').value.trim();
        if (!name) return alert('Please enter a group name');

        const selected = Array.from(document.querySelectorAll('.group-member-cb:checked')).map(cb => cb.value);
        selected.push(this.currentUser);

        const newGroup = {
            id: 'GRP-' + Date.now(),
            name: name,
            members: selected,
            createdBy: this.currentUser,
            createdAt: new Date().toISOString()
        };

        this.groups.push(newGroup);
        this.renderGroups();
        document.getElementById('createGroupModal').style.display = 'none';

        if (typeof apiClient !== 'undefined' && apiClient.saveChatterGroup) {
            await apiClient.saveChatterGroup(newGroup);
        }
        this.switchGroup(newGroup.id);
    },

    renderMentionDropdown: function (users) {
        const dropdown = document.getElementById('mention-dropdown');
        if (!dropdown) return;
        if (!users || users.length === 0) {
            dropdown.style.display = 'none';
            return;
        }
        dropdown.innerHTML = users.map(u =>
            `<button type="button" class="list-group-item list-group-item-action py-1 px-3 border-0 border-bottom" style="font-size: 0.9rem;" onclick="Chatter.insertMention('${escapeHtml(u)}')">
                <i class="fas fa-user-circle text-muted me-2"></i>${escapeHtml(u)}
            </button>`
        ).join('');
        dropdown.style.display = 'block';
    },

    insertMention: function (username) {
        const input = document.getElementById('chat-input');
        const val = input.value;
        const cursorPos = input.selectionStart;
        const textBeforeCursor = val.substring(0, cursorPos);
        const textAfterCursor = val.substring(cursorPos);

        const match = textBeforeCursor.match(/(?:^|\s)@([\w.-]*)$/);
        if (match) {
            const replaceStart = cursorPos - match[1].length;
            const newValue = val.substring(0, replaceStart) + username + ' ' + textAfterCursor;
            input.value = newValue;
            input.focus();

            const newPos = replaceStart + username.length + 1;
            input.selectionStart = input.selectionEnd = newPos;
        }
        document.getElementById('mention-dropdown').style.display = 'none';
    },

    updateGroup: async function () {
        const group = this.groups.find(g => g.id === this.editingGroupId);
        if (!group) return;

        const name = document.getElementById('newGroupName').value.trim();
        if (!name) return alert('Please enter a group name');

        const selected = Array.from(document.querySelectorAll('.group-member-cb:checked')).map(cb => cb.value);
        selected.push(this.currentUser);

        group.name = name;
        group.members = selected;

        this.renderGroups();
        document.getElementById('createGroupModal').style.display = 'none';

        if (typeof apiClient !== 'undefined' && apiClient.saveChatterGroup) {
            await apiClient.saveChatterGroup(group);
        }
        this.switchGroup(group.id);
    },

    openViewMembersModal: function () {
        const list = document.getElementById('viewMembersList');
        if (!list) return;
        list.innerHTML = '';
        
        let membersToDisplay = [];
        if (this.activeGroupId === 'global') {
            membersToDisplay = this.allUsers;
        } else {
            const group = this.groups.find(g => g.id === this.activeGroupId);
            if (group && group.members) {
                membersToDisplay = group.members;
            }
        }
        
        if (membersToDisplay.length === 0) {
            list.innerHTML = '<div class="text-center text-muted my-3">No members found.</div>';
        } else {
            membersToDisplay.forEach(u => {
                list.innerHTML += `<div class="mb-2 border-bottom pb-1"><i class="fas fa-user-circle text-muted me-2"></i> ${escapeHtml(u)}</div>`;
            });
        }
        
        document.getElementById('viewMembersModal').style.display = 'flex';
    },

    openMediaModal: function () {
        const list = document.getElementById('mediaModalList');
        list.innerHTML = '';
        
        const mediaMessages = this.messages.filter(m => m.attachment).reverse(); // Newest first
        
        if (mediaMessages.length === 0) {
            list.innerHTML = '<div class="text-center text-muted my-4">No media or attachments shared in this group yet.</div>';
        } else {
            mediaMessages.forEach(msg => {
                let d = new Date(msg.createdAt || msg.created_at);
                if (isNaN(d.getTime())) d = new Date();
                const timeString = d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                
                let previewHtml = '';
                if (msg.attachment.startsWith('data:audio')) {
                    previewHtml = `<audio controls src="${msg.attachment}" style="width: 100%; height: 35px; outline: none; margin-top: 5px;"></audio>`;
                } else if (msg.attachment.startsWith('data:image')) {
                    previewHtml = `<img src="${msg.attachment}" style="max-width: 100%; max-height: 150px; border-radius: 5px; cursor: pointer;" onclick="window.open('${msg.attachment}', '_blank')" title="Click to view full size">`;
                } else {
                    previewHtml = `<a href="${msg.attachment}" download="${escapeHtml(msg.attachmentName) || 'Attachment'}" class="btn btn-sm btn-outline-primary"><i class="fas fa-download me-1"></i> Download</a>`;
                }

                list.innerHTML += `
                    <div class="border rounded p-3 bg-light d-flex flex-column shadow-sm" style="gap: 5px;">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <strong><i class="fas fa-user-circle text-muted me-1"></i>${escapeHtml(msg.sender)}</strong>
                            <small class="text-muted">${timeString}</small>
                        </div>
                        ${msg.attachmentName ? `<div class="text-truncate small fw-bold text-secondary mb-2" style="max-width: 100%;"><i class="fas fa-file-alt me-1"></i>${escapeHtml(msg.attachmentName)}</div>` : ''}
                        <div class="text-center bg-white border rounded p-2" style="position:relative;">
                            ${previewHtml}
                        </div>
                    </div>`;
            });
        }
        document.getElementById('mediaModal').style.display = 'flex';
    },

    toggleRecording: async function () {
        if (this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            document.getElementById('btn-record').innerHTML = '<i class="fas fa-microphone"></i>';
            document.getElementById('btn-record').classList.remove('recording-pulse');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.addEventListener("dataavailable", event => {
                this.audioChunks.push(event.data);
            });

            this.mediaRecorder.addEventListener("stop", () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                if (audioBlob.size > 2 * 1024 * 1024) { // 2MB limit
                    alert("Voice message is too long (exceeds 2MB). Please record a shorter message.");
                    this.clearAttachment();
                    return;
                }
                this.selectedFile = new File([audioBlob], "voice_message.webm", { type: "audio/webm" });
                document.getElementById('file-name-text').innerHTML = '<i class="fas fa-microphone text-danger"></i> Voice Message Recorded';
                document.getElementById('attachment-name').style.display = 'block';
                document.getElementById('chat-input').focus();
                stream.getTracks().forEach(track => track.stop()); // release microphone
            });

            this.mediaRecorder.start();
            this.isRecording = true;
            document.getElementById('btn-record').innerHTML = '<i class="fas fa-stop"></i>';
            document.getElementById('btn-record').classList.add('recording-pulse');
        } catch (err) {
            alert("Microphone access denied or not available. " + err.message);
        }
    },

    showReactionPicker: function (msgId, event) {
        this.activeReactionMsgId = msgId;
        const picker = document.getElementById('reactionPicker');
        picker.style.display = 'flex';
        picker.style.left = Math.min(event.pageX, window.innerWidth - picker.offsetWidth - 20) + 'px';
        picker.style.top = Math.max(event.pageY - 40, 10) + 'px';
    },

    addReaction: async function (emoji, specificMsgId = null) {
        const msgId = specificMsgId || this.activeReactionMsgId;
        if (!msgId) return;

        const msgIndex = this.messages.findIndex(m => m.id === msgId);
        if (msgIndex === -1) return;

        const msg = this.messages[msgIndex];
        if (!msg.reactions) msg.reactions = {};
        if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

        const userIndex = msg.reactions[emoji].indexOf(this.currentUser);
        if (userIndex !== -1) {
            msg.reactions[emoji].splice(userIndex, 1);
            if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
        } else {
            msg.reactions[emoji].push(this.currentUser);
        }

        this.renderMessages();
        document.getElementById('reactionPicker').style.display = 'none';

        if (typeof apiClient !== 'undefined' && apiClient.saveMessage) {
            await apiClient.saveMessage(msg);
        }
    },

    clearAttachment: function () {
        this.selectedFile = null;
        document.getElementById('file-input').value = '';
        document.getElementById('attachment-name').style.display = 'none';
    },

    cancelEdit: function () {
        this.editingMessageId = null;
        document.getElementById('edit-mode-banner').style.display = 'none';
        document.getElementById('chat-input').value = '';
        document.getElementById('btn-send').innerHTML = '<i class="fas fa-paper-plane me-1"></i> Send';
        this.clearAttachment();
    },

    cancelReply: function () {
        this.replyingToMessageId = null;
        document.getElementById('reply-mode-banner').style.display = 'none';
    },

    replyToMessage: function (id) {
        const msg = this.messages.find(m => m.id === id);
        if (!msg) return;

        this.replyingToMessageId = id;
        document.getElementById('reply-to-user').innerText = msg.sender;
        document.getElementById('reply-to-text').innerText = msg.text || (msg.attachmentName ? 'Attachment: ' + msg.attachmentName : 'Message');
        document.getElementById('reply-mode-banner').style.display = 'block';

        this.cancelEdit(); // Mutually exclusive UI states
        document.getElementById('chat-input').focus();
    },

    showReadReceipts: function (msgId) {
        const msg = this.messages.find(m => m.id === msgId);
        if (!msg) return;

        if (!msg.readBy || msg.readBy.length === 0) {
            alert('This message has not been read by anyone yet.');
            return;
        }

        const list = document.getElementById('readReceiptsList');
        if (list) {
            list.innerHTML = msg.readBy.map(u => `<div class="mb-2 border-bottom pb-1"><i class="fas fa-user-circle text-muted me-2"></i> ${escapeHtml(u)}</div>`).join('');
            document.getElementById('readReceiptsModal').style.display = 'flex';
        }
    },

    loadMessages: async function (isPolling = false) {
        if (typeof apiClient !== 'undefined' && apiClient.getMessages) {
            const data = await apiClient.getMessages();
            if (data && Array.isArray(data)) {
                const oldLength = this.messages.length;

                if (isPolling && typeof apiClient.getChatterGroups !== 'undefined') {
                    this.groups = await apiClient.getChatterGroups() || [];
                }

                // Security & Group isolation
                const myGroupIds = this.groups.filter(g => g.members && g.members.includes(this.currentUser)).map(g => g.id);
                myGroupIds.push('global');

                const allowedMessages = data.filter(m => myGroupIds.includes(m.groupId || 'global'));
                this.messages = allowedMessages.filter(m => (m.groupId || 'global') === this.activeGroupId);

                this.unreadCounts = {};
                allowedMessages.forEach(m => {
                    const gId = m.groupId || 'global';
                    if (m.sender !== this.currentUser && (!m.readBy || !m.readBy.includes(this.currentUser))) {
                        if (gId !== this.activeGroupId) {
                            this.unreadCounts[gId] = (this.unreadCounts[gId] || 0) + 1;
                        }
                    }
                });
                this.renderGroups();

                this.renderMessages();

                // Automatically mark as read if it is loaded into the user's active window
                this.messages.forEach(msg => {
                    if (msg.sender !== this.currentUser) {
                        if (!msg.readBy) msg.readBy = [];
                        if (!msg.readBy.includes(this.currentUser)) {
                            msg.readBy.push(this.currentUser);
                            if (typeof apiClient !== 'undefined' && apiClient.saveMessage) {
                                apiClient.saveMessage(msg); // sync back read status to server
                            }
                        }
                    }
                });

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

    sendMessage: async function () {
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
                this.messages[msgIndex].isEdited = true;
                this.renderMessages();

                if (typeof apiClient !== 'undefined' && apiClient.saveMessage) {
                    const result = await apiClient.saveMessage(this.messages[msgIndex]);
                    if (result && result.success === false) {
                        alert("Failed to update message in database: " + (result.message || "Server Error"));
                    }
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
            groupId: this.activeGroupId,
            sender: this.currentUser,
            text: text,
            attachment: attachmentBase64,
            attachmentName: attachmentName,
            replyTo: replyToData,
            readBy: [],
            createdAt: new Date().toISOString()
        };

        this.messages.push(newMessage);
        this.renderMessages();
        this.scrollToBottom();

        textInput.value = '';
        this.clearAttachment();
        this.cancelReply();

        if (typeof apiClient !== 'undefined' && apiClient.saveMessage) {
            const result = await apiClient.saveMessage(newMessage);
            if (result && result.success === false) {
                console.error("Message save failed:", result.message);
                alert("Failed to save message to database: " + (result.message || "Server Error"));
            }
        }

        if (text.includes('@DEVELOPER')) {
            const devMessage = {
                id: 'MSG-DEV-' + Date.now() + Math.floor(Math.random() * 1000),
                groupId: 'global',
                sender: `${this.tenantName} - ${this.currentUser}`,
                text: text,
                attachment: attachmentBase64,
                attachmentName: attachmentName,
                readBy: [],
                tenant: '7908040851', // Route directly to developer's account chat
                createdAt: new Date().toISOString()
            };
            if (typeof apiClient !== 'undefined' && apiClient._saveCollection) {
                apiClient._saveCollection('chatter', devMessage);
            }
            alert("💡 Help Tip: You tagged @DEVELOPER. A copy of your message has been routed directly to the developer's 7908040851 support chat!");
        }

        sendBtn.innerHTML = ogText;
        sendBtn.disabled = false;
        textInput.disabled = false;
        textInput.focus();
    },

    editMessage: function (id) {
        const msg = this.messages.find(m => m.id === id);
        if (!msg) return;

        const msgTime = new Date(msg.createdAt || msg.created_at).getTime();
        if ((Date.now() - msgTime) > 24 * 60 * 60 * 1000) {
            alert("Messages can only be edited within 24 hours of sending.");
            return;
        }

        this.cancelReply(); // Mutually exclusive UI states
        document.getElementById('chat-input').value = msg.text;
        this.editingMessageId = id;
        document.getElementById('edit-mode-banner').style.display = 'block';
        document.getElementById('chat-input').focus();
        document.getElementById('btn-send').innerHTML = '<i class="fas fa-save me-1"></i> Update';
    },

    deleteMessage: async function (id) {
        const msg = this.messages.find(m => m.id === id);
        if (!msg) return;

        const msgTime = new Date(msg.createdAt || msg.created_at).getTime();
        if ((Date.now() - msgTime) > 24 * 60 * 60 * 1000) {
            alert("Messages can only be deleted within 24 hours of sending.");
            return;
        }

        if (!confirm("Are you sure you want to delete this message for everyone?")) return;

        this.messages = this.messages.filter(m => m.id !== id);
        this.renderMessages();

        if (typeof apiClient !== 'undefined' && apiClient.deleteMessage) {
            await apiClient.deleteMessage(id);
        }
    },

    toBase64: function (file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    },

    renderPinnedMessage: function () {
        const banner = document.getElementById('pinned-message-banner');
        if (!banner) return;

        const pinnedMsg = this.messages.find(m => m.isPinned);
        if (pinnedMsg) {
            document.getElementById('pinned-message-text').innerText = pinnedMsg.text || (pinnedMsg.attachmentName ? 'Attachment: ' + pinnedMsg.attachmentName : 'Message');
            banner.style.display = 'flex';
            banner.onclick = () => Chatter.scrollToMessage(pinnedMsg.id);
        } else {
            banner.style.display = 'none';
        }
    },

    unpinCurrentMessage: async function () {
        const pinnedMsg = this.messages.find(m => m.isPinned);
        if (pinnedMsg) {
            pinnedMsg.isPinned = false;
            if (typeof apiClient !== 'undefined' && apiClient.saveMessage) {
                await apiClient.saveMessage(pinnedMsg);
            }
            this.renderMessages();
        }
    },

    pinMessage: async function (id) {
        const msgIndex = this.messages.findIndex(m => m.id === id);
        if (msgIndex === -1) return;

        const msg = this.messages[msgIndex];
        const isCurrentlyPinned = msg.isPinned;

        // Unpin all currently pinned messages in this active group context
        const currentlyPinned = this.messages.filter(m => m.isPinned);
        for (let m of currentlyPinned) {
            m.isPinned = false;
            if (typeof apiClient !== 'undefined' && apiClient.saveMessage) {
                await apiClient.saveMessage(m);
            }
        }

        if (!isCurrentlyPinned) {
            msg.isPinned = true;
            if (typeof apiClient !== 'undefined' && apiClient.saveMessage) {
                await apiClient.saveMessage(msg);
            }
        }

        this.renderMessages();
    },

    renderMessages: function () {
        this.renderPinnedMessage();

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
                if (msg.attachment.startsWith('data:audio')) {
                    attachmentHtml = `<div class="mt-2"><audio controls src="${msg.attachment}" style="max-width: 220px; height: 35px; outline: none;"></audio></div>`;
                } else if (msg.attachment.startsWith('data:image')) {
                    attachmentHtml = `<div class="mt-2"><img src="${msg.attachment}" class="attachment-preview" onclick="window.open('${msg.attachment}', '_blank')" style="cursor:pointer;" title="Click to view full size"></div>`;
                } else {
                    attachmentHtml = `<div class="mt-2"><a href="${msg.attachment}" download="${escapeHtml(msg.attachmentName) || 'Attachment'}" class="btn btn-sm ${isMe ? 'btn-light text-primary' : 'btn-primary'}"><i class="fas fa-download me-1"></i> ${escapeHtml(msg.attachmentName) || 'Download File'}</a></div>`;
                }
            }

            let d = new Date(msg.createdAt || msg.created_at);
            if (isNaN(d.getTime())) d = new Date();
            let timeString = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            if (msg.isEdited) {
                timeString += ' <span class="ms-1 fst-italic" style="font-size: 0.7rem; opacity: 0.8;">(Edited)</span>';
            }
            const isPast24h = (Date.now() - d.getTime()) > 24 * 60 * 60 * 1000;

            let readReceiptHtml = '';
            if (isMe) {
                const isRead = msg.readBy && msg.readBy.length > 0;
                const readClass = isRead ? 'read' : '';
                const title = isRead ? `Read by: ${msg.readBy.join(', ')}` : 'Delivered';
                const icon = isRead ? '<i class="fas fa-check-double"></i>' : '<i class="fas fa-check"></i>';
                readReceiptHtml = `<span class="read-receipt ${readClass}" title="${escapeHtml(title)}" onclick="Chatter.showReadReceipts('${msg.id}')" style="cursor: pointer;">${icon}</span>`;
            }

            let reactionsHtml = '';
            if (msg.reactions && Object.keys(msg.reactions).length > 0) {
                reactionsHtml = '<div class="message-reactions">';
                for (const [emoji, users] of Object.entries(msg.reactions)) {
                    const isActive = users.includes(this.currentUser) ? 'active' : '';
                    reactionsHtml += `<span class="reaction-badge ${isActive}" title="${escapeHtml(users.join(', '))}" onclick="event.stopPropagation(); Chatter.addReaction('${emoji}', '${msg.id}')">${emoji} ${users.length}</span>`;
                }
                reactionsHtml += '</div>';
            }

            let actionHtml = `
                <div class="message-actions">
                    <button class="btn-react" onclick="event.stopPropagation(); Chatter.showReactionPicker('${msg.id}', event)" title="React"><i class="fas fa-smile"></i></button>
                    <button onclick="Chatter.replyToMessage('${msg.id}')" title="Reply"><i class="fas fa-reply"></i></button>
                    <button onclick="Chatter.pinMessage('${msg.id}')" title="${msg.isPinned ? 'Unpin' : 'Pin Message'}"><i class="fas fa-thumbtack ${msg.isPinned ? 'text-warning' : ''}"></i></button>
                    ${isMe ? (!isPast24h ? `
                    <button onclick="Chatter.editMessage('${msg.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                    <button onclick="Chatter.deleteMessage('${msg.id}')" title="Delete for Everyone"><i class="fas fa-trash"></i></button>
                    ` : `
                    <button disabled title="Cannot edit after 24 hours" style="opacity: 0.4; cursor: not-allowed;"><i class="fas fa-edit"></i></button>
                    <button disabled title="Cannot delete after 24 hours" style="opacity: 0.4; cursor: not-allowed;"><i class="fas fa-trash"></i></button>
                    `) : ''}
                </div>
            `;

            let replyHtml = '';
            if (msg.replyTo) {
                replyHtml = `
                <div class="reply-quote shadow-sm" onclick="Chatter.scrollToMessage('${msg.replyTo.id}')" title="Click to view original message">
                    <strong><i class="fas fa-reply me-1"></i> ${escapeHtml(msg.replyTo.sender)}</strong><br>
                    <span class="text-truncate d-inline-block" style="max-width:100%;">${escapeHtml(msg.replyTo.text)}</span>
                </div>`;
            }

            msgDiv.innerHTML = `
                ${!isMe ? `<div class="message-sender">${escapeHtml(msg.sender)}</div>` : ''}
                <div class="message-content shadow-sm">
                    ${replyHtml}
                    ${msg.text ? `<div class="${isOnlyEmojis(msg.text) ? 'jumbo-emoji' : ''}">${linkify(highlightMentions(escapeHtml(msg.text))).replace(/\n/g, '<br>')}</div>` : ''}
                    ${attachmentHtml}
                    <span class="message-time">${timeString}${readReceiptHtml}</span>
                    ${reactionsHtml}
                    ${actionHtml}
                </div>
            `;

            container.appendChild(msgDiv);
        });
    },

    scrollToBottom: function () {
        const container = document.getElementById('chat-messages');
        container.scrollTop = container.scrollHeight;
    },

    scrollToMessage: function (id) {
        const el = document.getElementById('msg-' + id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('highlight-message');
            setTimeout(() => {
                el.classList.remove('highlight-message');
            }, 2000);
        }
    }
};