class NancyVoiceAssistant {
    constructor() {
        this.interactionId = null;
        this.isListening = false;
        this.awaitingCustomerBalanceName = false;
        this.awaitingEntityType = null;
        this.suggestionTimer = null;
        this.suggestionRequestId = 0;
        this.questionCategories = {
            Sales: ["Unpaid invoices", "Total sales this month", "Recent invoices"],
            Stock: ["Check item stock", "Low stock items", "Godown stock count"],
            Accounts: ["Customer balance", "Supplier dues", "Today's Day Book"]
        };
        this.initUI();
        this.initSpeech();
    }

    initUI() {
        if (document.getElementById('nancy-widget-container')) return;

        const style = document.createElement('style');
        style.innerHTML = `
      #nancy-widget-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 99999;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      #nancy-call-btn {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: none;
        background: #0b57d0;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 14px rgba(11, 87, 208, 0.4);
        transition: transform 0.2s, background 0.2s;
        outline: none;
      }
      #nancy-call-btn:hover {
        transform: scale(1.05);
      }
      #nancy-chat-window {
        display: none;
        position: absolute;
        bottom: 70px;
        right: 0;
        width: 350px;
        height: 480px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        flex-direction: column;
        overflow: hidden;
      }
      body.dark-mode #nancy-chat-window {
        background: #1e1e1e;
        border-color: #333333;
        color: #e0e0e0;
      }
      .nancy-header {
        background: #0b57d0;
        color: white;
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
        font-size: 14px;
      }
      .nancy-messages {
        flex: 1;
        padding: 14px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        font-size: 13px;
      }
      .nancy-msg {
        max-width: 82%;
        padding: 8px 12px;
        border-radius: 10px;
        line-height: 1.4;
        word-break: break-word;
      }
      .nancy-msg.user {
        align-self: flex-end;
        background: #0b57d0;
        color: white;
        border-bottom-right-radius: 2px;
      }
      .nancy-msg.agent {
        align-self: flex-start;
        background: #f1f5f9;
        color: #1e293b;
        border-bottom-left-radius: 2px;
      }
      body.dark-mode .nancy-msg.agent {
        background: #2a2a2a;
        color: #e0e0e0;
      }
      .nancy-chips-container {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
      }
      .nancy-chip {
        background: #e0edff;
        color: #0b57d0;
        border: 1px solid #bfdbfe;
        border-radius: 14px;
        padding: 4px 10px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s ease-in-out;
        user-select: none;
      }
      .nancy-chip:hover {
        background: #0b57d0;
        color: #ffffff;
      }
      body.dark-mode .nancy-chip {
        background: #1e293b;
        color: #93c5fd;
        border-color: #334155;
      }
      body.dark-mode .nancy-chip:hover {
        background: #0b57d0;
        color: #ffffff;
      }
      .nancy-input-area {
        display: flex;
        align-items: center;
        padding: 10px;
        border-top: 1px solid #e2e8f0;
        background: #fafafa;
        gap: 6px;
      }
      #nancy-suggestions {
        display: none;
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: 58px;
        max-height: 190px;
        overflow-y: auto;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        box-shadow: 0 5px 18px rgba(0, 0, 0, .16);
        z-index: 2;
      }
      body.dark-mode #nancy-suggestions { background: #242424; border-color: #444; }
      .nancy-suggestion {
        display: block;
        width: 100%;
        padding: 9px 11px;
        border: 0;
        border-bottom: 1px solid #e2e8f0;
        text-align: left;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      body.dark-mode .nancy-suggestion { border-bottom-color: #444; }
      .nancy-suggestion:hover { background: rgba(11, 87, 208, .1); }
      .nancy-suggestion small { display: block; opacity: .7; margin-top: 2px; }
      body.dark-mode .nancy-input-area {
        background: #181818;
        border-color: #333333;
      }
      .nancy-input-area input {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #cbd5e1;
        border-radius: 20px;
        outline: none;
        font-size: 13px;
        background: #ffffff;
        color: inherit;
      }
      body.dark-mode .nancy-input-area input {
        background: #242424;
        border-color: #444444;
      }
      .nancy-icon-btn {
        background: none;
        border: none;
        color: #0b57d0;
        cursor: pointer;
        font-size: 16px;
        padding: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.15s;
      }
      .nancy-icon-btn:hover {
        background: rgba(11, 87, 208, 0.1);
      }
      .nancy-icon-btn.active-mic {
        color: #dc2626 !important;
      }
    `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.id = 'nancy-widget-container';
        container.innerHTML = `
      <div id="nancy-chat-window">
        <div class="nancy-header">
          <span><i class="fas fa-robot" style="margin-right: 6px;"></i> Nancy [Your Data Assistant]</span>
          <span style="cursor: pointer; font-size: 16px;" onclick="window.Nancy.toggleChatWindow()">&times;</span>
        </div>
        <div class="nancy-messages" id="nancy-message-list">
          <div class="nancy-msg agent">
            Hello! Ask me anything across your saved records.
            <div class="nancy-chips-container" id="nancy-chips-wrapper"></div>
          </div>
        </div>
        <div id="nancy-suggestions" role="listbox" aria-label="Matching records"></div>
        <div class="nancy-input-area">
          <button id="nancy-mic-toggle-btn" class="nancy-icon-btn" type="button" title="Speak">
            <i class="fas fa-microphone"></i>
          </button>
          <input type="text" id="nancy-text-input" placeholder="Ask Nancy or pick a question..." autocomplete="off">
          <button id="nancy-send-btn" class="nancy-icon-btn" type="button" title="Send">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
      <button id="nancy-call-btn" type="button" title="Open Nancy">
        <i class="fas fa-headset" style="font-size: 22px;"></i>
      </button>
    `;
        document.body.appendChild(container);

        this.chatWindow = document.getElementById('nancy-chat-window');
        this.messageList = document.getElementById('nancy-message-list');
        this.textInput = document.getElementById('nancy-text-input');
        this.micBtn = document.getElementById('nancy-mic-toggle-btn');
        this.sendBtn = document.getElementById('nancy-send-btn');
        this.callBtn = document.getElementById('nancy-call-btn');
        this.suggestionsBox = document.getElementById('nancy-suggestions');

        this.renderCategoryChips();

        this.callBtn.addEventListener('click', () => this.toggleChatWindow());
        this.micBtn.addEventListener('click', () => this.toggleListening());
        this.sendBtn.addEventListener('click', () => this.handleTextSubmit());
        this.textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleTextSubmit();
        });
        this.textInput.addEventListener('input', () => this.scheduleSuggestions());
    }

    renderCategoryChips() {
        const wrapper = document.getElementById('nancy-chips-wrapper');
        if (!wrapper) return;
        wrapper.innerHTML = '';
        Object.entries(this.questionCategories).forEach(([category, questions]) => {
            questions.forEach(question => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'nancy-chip';
                chip.innerText = `[${category}] ${question}`;
                chip.addEventListener('click', () => {
                    const normalized = question.toLowerCase();
                    const entityType = normalized === 'customer balance' ? 'customer'
                        : normalized === 'supplier dues' ? 'supplier'
                            : normalized === 'check item stock' ? 'item' : null;
                    if (entityType) {
                        this.awaitingEntityType = entityType;
                        this.textInput.value = '';
                        this.textInput.placeholder = `Type a ${entityType === 'item' ? 'item' : entityType} name...`;
                        this.clearSuggestions();
                        this.appendMessage(`Enter a ${entityType === 'item' ? 'item' : entityType} name to see matches.`, 'agent');
                        this.textInput.focus();
                        return;
                    }
                    this.textInput.value = question;
                    this.handleTextSubmit();
                });
                wrapper.appendChild(chip);
            });
        });
    }

    clearSuggestions() {
        if (!this.suggestionsBox) return;
        this.suggestionsBox.replaceChildren();
        this.suggestionsBox.style.display = 'none';
    }

    scheduleSuggestions() {
        clearTimeout(this.suggestionTimer);
        const type = this.awaitingEntityType;
        const query = this.textInput.value.trim();
        if (!type || !query) {
            this.clearSuggestions();
            return;
        }
        this.suggestionTimer = setTimeout(() => this.loadSuggestions(type, query), 180);
    }

    async loadSuggestions(type, query) {
        const requestId = ++this.suggestionRequestId;
        try {
            const url = `/api/nancy/suggestions?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}`;
            const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
            if (!response.ok) return this.clearSuggestions();
            const data = await response.json();
            if (requestId !== this.suggestionRequestId || query !== this.textInput.value.trim() || type !== this.awaitingEntityType) return;
            this.suggestionsBox.replaceChildren();
            (data.suggestions || []).forEach(suggestion => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'nancy-suggestion';
                button.setAttribute('role', 'option');
                button.textContent = suggestion.label || '';
                if (suggestion.detail) {
                    const detail = document.createElement('small');
                    detail.textContent = suggestion.detail;
                    button.appendChild(detail);
                }
                button.addEventListener('click', () => {
                    this.textInput.value = suggestion.label || '';
                    this.clearSuggestions();
                    this.handleTextSubmit();
                });
                this.suggestionsBox.appendChild(button);
            });
            this.suggestionsBox.style.display = this.suggestionsBox.childElementCount ? 'block' : 'none';
        } catch (_) {
            this.clearSuggestions();
        }
    }

    toggleChatWindow() {
        const isVisible = this.chatWindow.style.display === 'flex';
        this.chatWindow.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            this.textInput.focus();
        }
    }

    initSpeech() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.micBtn.style.display = 'none';
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-IN';

        this.recognition.onstart = () => {
            this.isListening = true;
            this.micBtn.classList.add('active-mic');
            this.textInput.placeholder = 'Listening...';
        };

        this.recognition.onresult = async (event) => {
            const transcript = event.results[0][0].transcript;
            this.textInput.value = transcript;
            await this.handleTextSubmit();
        };

        this.recognition.onerror = () => {
            this.textInput.placeholder = 'Ask Nancy or pick a question...';
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this.micBtn.classList.remove('active-mic');
            this.textInput.placeholder = 'Ask Nancy or pick a question...';
        };
    }

    toggleListening() {
        if (!this.recognition) return;
        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.recognition.start();
        }
    }

    appendMessage(text, sender) {
        const msg = document.createElement('div');
        msg.className = `nancy-msg ${sender}`;
        this.renderMessageText(msg, text);
        this.messageList.appendChild(msg);
        this.messageList.scrollTop = this.messageList.scrollHeight;
    }

    renderMessageText(element, text) {
        // Render only the small bold Markdown convention used by Nancy's invoice list.
        // All other content is inserted as text, never interpreted as HTML.
        const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
        parts.forEach(part => {
            if (part.startsWith('**') && part.endsWith('**')) {
                const strong = document.createElement('strong');
                strong.textContent = part.slice(2, -2);
                element.appendChild(strong);
            } else {
                element.appendChild(document.createTextNode(part));
            }
        });
    }

    async handleTextSubmit() {
        const query = this.textInput.value.trim();
        if (!query) return;

        const activeType = this.awaitingEntityType || (this.awaitingCustomerBalanceName ? 'customer' : null);
        let requestMessage = query;
        if (activeType && !/^(?:customer\s+balance|supplier\s+dues|check\s+(?:item\s+)?stock)\s+(?:for|of)\s+/i.test(query)) {
            if (activeType === 'customer') requestMessage = `Customer balance for ${query}`;
            else if (activeType === 'supplier') requestMessage = `Supplier dues for ${query}`;
            else if (activeType === 'item') requestMessage = `Check item stock for ${query}`;
        }
        this.awaitingCustomerBalanceName = false;
        this.awaitingEntityType = null;
        this.textInput.placeholder = 'Ask Nancy or pick a question...';
        this.clearSuggestions();
        const requestType = activeType || this.entityTypeForPrompt(requestMessage);

        this.appendMessage(query, 'user');
        this.textInput.value = '';

        const loadingId = 'nancy-loading-' + Date.now();
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'nancy-msg agent';
        loadingMsg.id = loadingId;
        loadingMsg.innerText = 'Searching your records...';
        this.messageList.appendChild(loadingMsg);
        this.messageList.scrollTop = this.messageList.scrollHeight;

        const requestController = new AbortController();
        const requestTimeout = setTimeout(() => requestController.abort(), 50000);
        try {
            const response = await fetch('/api/nancy/chat', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                signal: requestController.signal,
                body: JSON.stringify({
                    message: requestMessage,
                    previousInteractionId: this.interactionId
                })
            });

            const data = await response.json().catch(() => ({}));
            const targetMsg = document.getElementById(loadingId);

            if (response.ok && data.reply) {
                if (targetMsg) {
                    targetMsg.textContent = '';
                    this.renderMessageText(targetMsg, data.reply);
                }
                if ('interactionId' in data) this.interactionId = data.interactionId;
                if (/which customer|customer name.*balance/i.test(data.reply)) this.awaitingEntityType = 'customer';
                else if (/which supplier|supplier name.*due/i.test(data.reply)) this.awaitingEntityType = 'supplier';
                else if (/which item|item name.*stock/i.test(data.reply)) this.awaitingEntityType = 'item';
                if (this.awaitingEntityType) {
                    const name = this.awaitingEntityType === 'item' ? 'item' : this.awaitingEntityType;
                    this.textInput.placeholder = `Type a ${name} name...`;
                }
                this.speak(data.reply);
            } else {
                if (targetMsg) targetMsg.innerText = data.error || 'No records found.';
            }
        } catch (err) {
            if (activeType) {
                this.awaitingEntityType = activeType;
                this.textInput.placeholder = `Type a ${activeType === 'item' ? 'item' : activeType} name...`;
            }
            const targetMsg = document.getElementById(loadingId);
            if (targetMsg) {
                targetMsg.innerText = err.name === 'AbortError'
                    ? 'Nancy is taking longer than expected. Please try again.'
                    : 'Unable to reach Nancy right now.';
            }
        } finally {
            clearTimeout(requestTimeout);
        }
        this.messageList.scrollTop = this.messageList.scrollHeight;
    }

    entityTypeForPrompt(prompt) {
        const value = String(prompt || '').toLowerCase();
        if (/supplier.*due|\bdues\b/.test(value)) return 'supplier';
        if (/item.*stock|\bstock\b/.test(value)) return 'item';
        if (/customer.*balance|\bbalance\b/.test(value)) return 'customer';
        return null;
    }

    speak(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            const voices = window.speechSynthesis.getVoices();
            const femaleVoiceName = /female|heera|priya|veena|raveena|lekha|zira|samantha|karen|susan|hazel|aria|jenny|sonia|neerja/i;
            const voice = voices.find(item => /^en-IN$/i.test(item.lang) && femaleVoiceName.test(item.name))
                || voices.find(item => femaleVoiceName.test(item.name) && /^en/i.test(item.lang))
                || voices.find(item => /^en-IN$/i.test(item.lang));
            if (voice) {
                utterance.voice = voice;
                utterance.lang = voice.lang;
            } else {
                utterance.lang = 'en-IN';
            }
            utterance.rate = 0.96;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.Nancy = new NancyVoiceAssistant();
    });
} else {
    window.Nancy = new NancyVoiceAssistant();
}
