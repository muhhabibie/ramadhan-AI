/**
 * @fileoverview Frontend logic untuk Ramadhan AI (Vercel Serverless Version).
 * Handle state chat, integrasi API, geolocation, dan rendering markdown + audio.
 */

// ==========================================
// GLOBAL STATE
// ==========================================
let chatSessions = JSON.parse(localStorage.getItem("ramadhan_chats")) || {};
let sessionId = localStorage.getItem("current_session") || "session_" + Date.now();
let currentAbortController = null;
let currentCity = localStorage.getItem("user_city") || "Malang";
let quranAudioPlayer = null;

// ==========================================
// CORE & UTILS
// ==========================================

/**
 * Parser markdown custom untuk render chat.
 */
function formatMarkdown(text) {
    // 1. Fix AI format: Tarik tag [QURAN] agar menempel ke teks Arab
    let processedText = text.replace(/([\u0600-\u06FF][\u0600-\u06FF\s\.,،؛؟()'\-]*[\u0600-\u06FF])([\s\S]{0,350}?)\[(?:QURAN:)?\s*(\d+)\s*:\s*(\d+)\s*\]/gi, '$1 [QURAN:$3:$4]$2');

    let html = processedText;

    // 2. Basic Markdown parser
    html = html.replace(/^(#{1,6})\s+(.*$)/gim, '<h3 class="chat-heading">$2</h3>');
    html = html.replace(/^(\*\*\*|---)$/gim, '<hr class="chat-divider">');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!<[^>]*)\*(.*?)\*(?![^<]*>)/g, '<em>$1</em>');
    html = html.replace(/^\* (.*$)/gim, '<div class="list-item">• $1</div>');
    
    // 3. Render teks Arab & Audio Player
    const arabicRegex = /([\u0600-\u06FF][\u0600-\u06FF\s\.,،؛؟()'\-]*[\u0600-\u06FF])\s*(?:\[QURAN:(\d+):(\d+)\])?/g;
    
    html = html.replace(arabicRegex, function(match, arabicText, surah, ayah) {
        if (surah && ayah) {
            return `
            <div class="arabic-container">
                <div class="arabic-text" dir="rtl">${arabicText}</div>
                <button class="play-audio-btn" onclick="playRealQuranAudio(${surah}, ${ayah}, this)">▶ Putar Murottal Asli</button>
                <small class="audio-notice">Suara asli Qari tersedia</small>
            </div>`;
        } else {
            const encodedText = encodeURIComponent(arabicText);
            return `
            <div class="arabic-container">
                <div class="arabic-text" dir="rtl">${arabicText}</div>
                <button class="play-audio-btn" onclick="playArabicAudio(decodeURIComponent('${encodedText}'))">▶ Putar Suara (AI)</button>
                <small class="audio-notice">ℹSuara AI untuk Hadits/Doa</small>
            </div>`;
        }
    });
    
    return html.replace(/\n/g, '<br>');
}

/**
 * Fetch jadwal sholat dari Aladhan API
 */
async function loadPrayerDashboard(city) {
    try {
        const res = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${city}&country=Indonesia&method=11`);
        const data = await res.json();
        
        if(data.code === 200) {
            const t = data.data.timings;
            document.getElementById("imsak-time").textContent = t.Imsak;
            document.getElementById("subuh-time").textContent = t.Fajr;
            document.getElementById("dzuhur-time").textContent = t.Dhuhr;
            document.getElementById("ashar-time").textContent = t.Asr;
            document.getElementById("maghrib-time").textContent = t.Maghrib;
            document.getElementById("isya-time").textContent = t.Isha;
            
            document.getElementById("current-city").textContent = city;
            localStorage.setItem("user_city", city);
            currentCity = city;
        }
    } catch (e) { 
        console.error("Failed to fetch prayer times:", e); 
    }
}

/**
 * Play audio murottal asli
 */
async function playRealQuranAudio(surah, ayah, btnElement) {
    if (quranAudioPlayer) { quranAudioPlayer.pause(); quranAudioPlayer.currentTime = 0; }
    window.speechSynthesis.cancel();
    
    const originalText = btnElement.innerHTML;
    btnElement.innerHTML = "Memuat...";
    
    try {
        const res = await fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ar.alafasy`);
        const json = await res.json();
        
        if(json.code === 200) {
            quranAudioPlayer = new Audio(json.data.audio);
            quranAudioPlayer.play();
            btnElement.innerHTML = "🔊 Diputar...";
            quranAudioPlayer.onended = () => btnElement.innerHTML = originalText;
        }
    } catch (e) { 
        btnElement.innerHTML = originalText;
        alert("Gagal load audio murottal.");
    }
}

function playArabicAudio(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        if (quranAudioPlayer) quranAudioPlayer.pause();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA'; 
        utterance.rate = 0.85;
        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
// SESSION & UI MANAGEMENT
// ==========================================

function saveMessageToSession(role, text) {
    if (!chatSessions[sessionId]) {
        chatSessions[sessionId] = { 
            title: text.substring(0, 25) + "...", 
            messages: [], 
            timestamp: Date.now() 
        };
    }
    chatSessions[sessionId].messages.push({ role, text });
    localStorage.setItem("ramadhan_chats", JSON.stringify(chatSessions));
    localStorage.setItem("current_session", sessionId);
    renderSidebar();
}

function renderSidebar() {
    const list = document.getElementById("history-list");
    if (!list) return;
    list.innerHTML = "";
    Object.keys(chatSessions).sort((a,b) => chatSessions[b].timestamp - chatSessions[a].timestamp).forEach(id => {
        const div = document.createElement("div");
        div.className = `history-item ${id === sessionId ? 'active' : ''}`;
        div.innerHTML = `<span>${chatSessions[id].title}</span><span onclick="event.stopPropagation(); deleteChat('${id}')">&times;</span>`;
        div.onclick = () => loadSession(id);
        list.appendChild(div);
    });
}

function deleteChat(id) {
    delete chatSessions[id];
    localStorage.setItem("ramadhan_chats", JSON.stringify(chatSessions));
    if (id === sessionId) startNewChat(); 
    else renderSidebar();
}

function loadSession(id) {
    sessionId = id; 
    localStorage.setItem("current_session", sessionId);
    const chatHistory = document.getElementById("chat-history");
    document.getElementById("welcome-screen").style.display = 'none';
    chatHistory.style.display = 'flex'; 
    chatHistory.innerHTML = "";
    
    chatSessions[id].messages.forEach((msg, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = msg.role === 'bot' ? "bot-message-wrapper" : "message user-message";
        const inner = document.createElement("div");
        inner.className = msg.role === 'bot' ? "message bot-message" : "";
        inner.innerHTML = formatMarkdown(msg.text);
        wrapper.appendChild(inner); 
        
        if (msg.role === 'bot' && index === chatSessions[id].messages.length - 1) {
            const actionDiv = document.createElement("div");
            actionDiv.className = "message-actions";
            const retryBtn = document.createElement("button");
            retryBtn.className = "action-btn retry-btn";
            retryBtn.innerHTML = "🔄 Retry";
            let userPrompt = (index > 0 && chatSessions[id].messages[index - 1].role === 'user') ? chatSessions[id].messages[index - 1].text : "";
            retryBtn.onclick = () => {
                wrapper.remove();
                chatSessions[id].messages.pop();
                localStorage.setItem("ramadhan_chats", JSON.stringify(chatSessions));
                fetchBotResponse(userPrompt);
            };
            actionDiv.appendChild(retryBtn);
            wrapper.appendChild(actionDiv);
        }
        chatHistory.appendChild(wrapper);
    });
    chatHistory.scrollTop = chatHistory.scrollHeight;
    renderSidebar();
}

function startNewChat() {
    sessionId = "session_" + Date.now(); 
    localStorage.setItem("current_session", sessionId);
    document.getElementById("chat-history").innerHTML = "";
    document.getElementById("chat-history").style.display = 'none';
    document.getElementById("welcome-screen").style.display = 'flex';
    renderSidebar();
}

// ==========================================
// CHAT & API INTERACTION
// ==========================================

async function sendMessage() {
    const input = document.getElementById("user-input");
    const message = input.value.trim();
    if (!message) return;
    
    if (document.getElementById("welcome-screen").style.display !== 'none') {
        document.getElementById("welcome-screen").style.display = 'none';
        document.getElementById("chat-history").style.display = 'flex';
    }
    
    const history = document.getElementById("chat-history");
    const msgDiv = document.createElement("div");
    msgDiv.className = "message user-message";
    msgDiv.innerHTML = formatMarkdown(message);
    history.appendChild(msgDiv);
    
    saveMessageToSession("user", message);
    input.value = ""; 
    await fetchBotResponse(message);
}

/**
 * MODIFIKASI: Hit API Serverless Vercel
 */
async function fetchBotResponse(message) {
    const history = document.getElementById("chat-history");
    document.querySelectorAll('.message-actions').forEach(el => el.style.display = 'none');

    const wrapper = document.createElement("div");
    wrapper.className = "bot-message-wrapper";
    const msgDiv = document.createElement("div");
    msgDiv.className = "message bot-message";
    msgDiv.innerHTML = "Sedang memikirkan...";
    
    const actionDiv = document.createElement("div");
    actionDiv.className = "message-actions";
    
    const stopBtn = document.createElement("button");
    stopBtn.className = "action-btn stop-btn";
    stopBtn.innerHTML = "⏹ Stop";
    
    stopBtn.onclick = () => {
        if (currentAbortController) {
            currentAbortController.abort();
            stopBtn.style.display = 'none';
            retryBtn.style.display = 'inline-flex';
        }
    };

    const retryBtn = document.createElement("button");
    retryBtn.className = "action-btn retry-btn";
    retryBtn.innerHTML = "🔄 Retry";
    retryBtn.style.display = 'none';
    
    retryBtn.onclick = () => {
        wrapper.remove();
        if (chatSessions[sessionId]?.messages.length > 0) {
            if (chatSessions[sessionId].messages[chatSessions[sessionId].messages.length - 1].role === 'bot') {
                chatSessions[sessionId].messages.pop();
                localStorage.setItem("ramadhan_chats", JSON.stringify(chatSessions));
            }
        }
        fetchBotResponse(message);
    };

    actionDiv.appendChild(stopBtn);
    actionDiv.appendChild(retryBtn);
    wrapper.appendChild(msgDiv);
    wrapper.appendChild(actionDiv);
    history.appendChild(wrapper);
    history.scrollTop = history.scrollHeight;

    // AMBIL HISTORY UNTUK SERVERLESS (Agar AI ingat konteks)
    const currentSession = chatSessions[sessionId] || { messages: [] };
    const historyPayload = currentSession.messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
    }));

    currentAbortController = new AbortController();
    
    try {
        // GANTI URL KE RELATIVE PATH UNTUK VERCEL
        const response = await fetch("/api/chat", {
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: message,
                history: historyPayload 
            }),
            signal: currentAbortController.signal
        });

        const data = await response.json();
        stopBtn.style.display = 'none';
        retryBtn.style.display = 'inline-flex';

        if (data.status === "success") {
            await typeMessage(msgDiv, data.reply);
            saveMessageToSession("bot", data.reply);
            if (data.detected_city) loadPrayerDashboard(data.detected_city);
        } else {
            msgDiv.innerHTML = formatMarkdown(data.reply);
        }

    } catch (e) { 
        stopBtn.style.display = 'none';
        retryBtn.style.display = 'inline-flex';
        if (e.name === 'AbortError') {
            msgDiv.innerHTML += "<br><em>[Pesan dihentikan]</em>";
        } else {
            msgDiv.innerHTML = "Waduh, gagal narik jawaban dari server."; 
        }
    }
}

async function autoDetectLocation() {
    document.getElementById("current-city").textContent = "Mendeteksi lokasi...";
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                    const data = await res.json();
                    let detectedCity = data.address.city || data.address.town || data.address.regency || "Jakarta";
                    detectedCity = detectedCity.replace(/Kota|Kabupaten/gi, '').trim();
                    loadPrayerDashboard(detectedCity);
                } catch (e) {
                    loadPrayerDashboard(currentCity); 
                }
            },
            () => { loadPrayerDashboard(currentCity); }
        );
    } else {
        loadPrayerDashboard(currentCity);
    }
}

function typeMessage(element, text) {
    return new Promise((resolve) => {
        let i = 0; 
        let html = formatMarkdown(text);
        let isTag = false;
        element.innerHTML = "";
        function type() {
            if (i < html.length) {
                let char = html.charAt(i);
                if (char === '<') isTag = true;
                if (char === '>') { isTag = false; i++; type(); return; }
                if (isTag) { 
                    i++; type(); 
                } else {
                    element.innerHTML = html.substring(0, i + 1);
                    i++;
                    setTimeout(type, 10);
                }
                const chatHistory = document.getElementById("chat-history");
                chatHistory.scrollTop = chatHistory.scrollHeight;
            } else {
                element.innerHTML = html;
                resolve();
            }
        }
        type();
    });
}

function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("active");
    document.getElementById("sidebar-overlay").classList.toggle("active");
}

function quickChat(m) { 
    document.getElementById("user-input").value = m; 
    sendMessage(); 
}

function handleKeyPress(e) { 
    if (e.key === "Enter") sendMessage(); 
}

window.onload = () => { 
    autoDetectLocation(); 
    renderSidebar(); 
};