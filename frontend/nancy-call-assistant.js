class NancyVoiceAssistant {
    constructor() {
        this.interactionId = null;
        this.isListening = false;
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
          <span><i class="fas fa-robot" style="margin-right: 6px;"></i> Nancy Assistant</span>
          <span style="cursor: pointer; font-size: 16px;" onclick="window.Nancy.toggleChatWindow()">&times;</span>
        </div>
        <div class="nancy-messages" id="nancy-message-list">
          <div class="nancy-msg agent">
            Hello! Ask me anything across your invoices, accounts, and stock.
            <div class="nancy-chips-container" id="nancy-chips-wrapper"></div>
          </div>
        </div>
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

        this.renderCategoryChips();

        this.callBtn.addEventListener('click', () => this.toggleChatWindow());
        this.micBtn.addEventListener('click', () => this.toggleListening());
        this.sendBtn.addEventListener('click', () => this.handleTextSubmit());
        this.textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleTextSubmit();
        });
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
                    this.textInput.value = question;
                    this.handleTextSubmit();
                });
                wrapper.appendChild(chip);
            });
        });
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
        msg.innerText = text;
        this.messageList.appendChild(msg);
        this.messageList.scrollTop = this.messageList.scrollHeight;
    }

    async handleTextSubmit() {
        const query = this.textInput.value.trim();
        if (!query) return;

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
                    message: query,
                    previousInteractionId: this.interactionId
                })
            });

            const data = await response.json().catch(() => ({}));
            const targetMsg = document.getElementById(loadingId);

            if (response.ok && data.reply) {
                if (targetMsg) targetMsg.innerText = data.reply;
                if ('interactionId' in data) this.interactionId = data.interactionId;
                this.speak(data.reply);
            } else {
                if (targetMsg) targetMsg.innerText = data.error || 'No records found.';
            }
        } catch (err) {
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

    speak(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.lang = 'en-IN';
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
