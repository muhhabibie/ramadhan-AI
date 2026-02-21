/**
 * @fileoverview Frontend logic untuk Ramadhan AI.
 * Mengelola state chat, integrasi Vercel API, deteksi lokasi, dan audio murottal.
 */

// ==========================================
// 1. GLOBAL STATE & INITIALIZATION
// ==========================================
let chatSessions = JSON.parse(localStorage.getItem("ramadhan_chats")) || {};
let sessionId = localStorage.getItem("current_session") || "session_" + Date.now();
let currentAbortController = null;
let currentCity = localStorage.getItem("user_city") || "Malang";
let quranAudioPlayer = null;

// ==========================================
// 2. CORE UTILS (Markdown & Audio)
// ==========================================

/**
 * Parser Markdown kustom untuk render teks dan tombol audio.
 */
function formatMarkdown(text) {
    // Regex fleksibel untuk menangkap [QURAN:1:1] atau [1:1] dengan toleransi spasi
    const arabicRegex = /([\u0600-\u06FF][\u0600-\u06FF\s\.,،؛؟()'\-]*[\u0600-\u06FF])\s*(?:\[(?:QURAN:)?\s*(\d+)\s*:\s*(\d+)\s*\])?/gi;

    let html = text;

    // Basic Markdown
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^(#{1,6})\s+(.*$)/gim, '<h3 class="chat-heading">$2</h3>');
    html = html.replace(/^\* (.*$)/gim, '<div class="list-item">• $1</div>');
    
    // Injeksi Kontainer Arab & Tombol Audio
    html = html.replace(arabicRegex, function(match, arabicText, surah, ayah) {
        if (surah && ayah) {
            return `
            <div class="arabic-container">
                <div class="arabic-text" dir="rtl">${arabicText}</div>
                <button class="play-audio-btn" onclick="playRealQuranAudio(${surah}, ${ayah}, this)">▶ Putar Murottal</button>
                <small class="audio-notice">✨ Suara asli Qari tersedia</small>
            </div>`;
        } else {
            const encodedText = encodeURIComponent(arabicText);
            return `
            <div class="arabic-container">
                <div class="arabic-text" dir="rtl">${arabicText}</div>
                <button class="play-audio-btn" onclick="playArabicAudio(decodeURIComponent('${encodedText}'))">▶ Putar Suara (AI)</button>
                <small class="audio-notice">ℹ️ Suara AI untuk Hadits/Doa</small>
            </div>`;
        }
    });
    
    return html.replace(/\n/g, '<br>');
}

/**
 * Memutar Murottal asli (Mishary Rashid) via API alquran.cloud.
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
            btnElement.innerHTML = "🔊 Sedang Mengaji...";
            quranAudioPlayer.onended = () => btnElement.innerHTML = originalText;
        }
    } catch (e) { 
        btnElement.innerHTML = originalText;
        alert("Gagal memuat murottal. Cek koneksi Antum.");
    }
}

/**
 * Suara AI (TTS) untuk teks Arab non-Quran.
 */
function playArabicAudio(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        if (quranAudioPlayer) quranAudioPlayer.pause();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA'; 
        utterance.rate = 0.8; 
        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
// 3. DASHBOARD & GEOLOCATION
// ==========================================

/**
 * Fetch jadwal sholat dari Aladhan API.
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
        console.error("Gagal update dashboard:", e); 
    }
}

/**
 * Deteksi lokasi otomatis via Geolocation API.
 */
async function autoDetectLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                    const data = await res.json();
                    let city = data.address.city || data.address.town || data.address.regency || "Jakarta";
                    city = city.replace(/Kota|Kabupaten/gi, '').trim();
                    loadPrayerDashboard(city);
                } catch (e) { loadPrayerDashboard(currentCity); }
            },
            () => { loadPrayerDashboard(currentCity); }
        );
    } else { loadPrayerDashboard(currentCity); }
}

// ==========================================
// 4. SESSION MANAGEMENT
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
// 5. CHAT LOGIC & API
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

async function fetchBotResponse(message) {
    const history = document.getElementById("chat-history");
    const wrapper = document.createElement("div");
    wrapper.className = "bot-message-wrapper";
    const msgDiv = document.createElement("div");
    msgDiv.className = "message bot-message";
    msgDiv.innerHTML = "Sedang memikirkan...";
    
    wrapper.appendChild(msgDiv);
    history.appendChild(wrapper);
    history.scrollTop = history.scrollHeight;

    const currentSession = chatSessions[sessionId] || { messages: [] };
    const historyPayload = currentSession.messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
    }));

    currentAbortController = new AbortController();
    
    try {
        const response = await fetch("/api/chat", {
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: message, history: historyPayload }),
            signal: currentAbortController.signal
        });

        const data = await response.json();
        if (data.status === "success") {
            await typeMessage(msgDiv, data.reply);
            saveMessageToSession("bot", data.reply);
            if (data.detected_city) loadPrayerDashboard(data.detected_city);
        } else {
            msgDiv.innerHTML = formatMarkdown(data.reply);
        }
    } catch (e) { 
        if (e.name !== 'AbortError') msgDiv.innerHTML = "Waduh, gagal narik jawaban dari server."; 
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
                if (isTag) { i++; type(); } 
                else {
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

// ==========================================
// 6. UI HELPERS & ONLOAD
// ==========================================

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