/**
 * @fileoverview Frontend logic untuk Ramadhan AI.
 * Perbaikan: Suara AI akan selalu muncul menggunakan default sistem jika suara Arab tidak tersedia.
 */

// ==========================================
// 1. GLOBAL STATE
// ==========================================
let chatSessions = JSON.parse(localStorage.getItem("ramadhan_chats")) || {};
let sessionId = localStorage.getItem("current_session") || "session_" + Date.now();
let currentAbortController = null;
let currentCity = localStorage.getItem("user_city") || "Malang";
let quranAudioPlayer = null;

// ==========================================
// 2. CORE UTILS (Markdown & Audio)
// ==========================================

function formatMarkdown(text) {
    // Regex fleksibel untuk menangkap [QURAN:1:1]
    const arabicRegex = /([\u0600-\u06FF][\u0600-\u06FF\s\.,،؛؟()'\-]*[\u0600-\u06FF])\s*(?:\[(?:QURAN:)?\s*(\d+)\s*:\s*(\d+)\s*\])?/gi;

    let html = text;
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^(#{1,6})\s+(.*$)/gim, '<h3 class="chat-heading">$2</h3>');
    html = html.replace(/^\* (.*$)/gim, '<div class="list-item">• $1</div>');
    
    html = html.replace(arabicRegex, function(match, arabicText, surah, ayah) {
        if (surah && ayah) {
            return `
            <div class="arabic-container">
                <div class="arabic-text" dir="rtl">${arabicText}</div>
                <button class="play-audio-btn" onclick="playRealQuranAudio(${surah}, ${ayah}, this)">▶ Putar Murottal</button>
            </div>`;
        } else {
            const encodedText = encodeURIComponent(arabicText);
            return `
            <div class="arabic-container">
                <div class="arabic-text" dir="rtl">${arabicText}</div>
                <button class="play-audio-btn" onclick="playArabicAudio(decodeURIComponent('${encodedText}'))">▶ Putar Suara (AI)</button>
            </div>`;
        }
    });
    
    return html.replace(/\n/g, '<br>');
}

/**
 * Suara AI (TTS) - VERSI FIX: Suara pasti muncul
 */
function playArabicAudio(text) {
    if (!('speechSynthesis' in window)) {
        alert("Browser Antum tidak mendukung suara AI.");
        return;
    }

    // Batalkan suara/murottal yang sedang jalan
    window.speechSynthesis.cancel();
    if (quranAudioPlayer) quranAudioPlayer.pause();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Ambil daftar suara yang tersedia di perangkat
    const voices = window.speechSynthesis.getVoices();
    
    // Coba cari suara Arab dulu
    const arabicVoice = voices.find(v => v.lang.toLowerCase().includes('ar'));

    if (arabicVoice) {
        utterance.voice = arabicVoice;
        utterance.lang = arabicVoice.lang;
    } else {
        // JIKA ARAB TIDAK ADA, JANGAN PAKSA ar-SA (agar suara default muncul)
        console.warn("Suara Arab tidak ditemukan. Menggunakan suara default sistem.");
        // Browser akan otomatis pakai bahasa default (Indo/English)
    }

    utterance.rate = 0.85; // Sedikit pelan agar jelas
    utterance.pitch = 1;
    
    window.speechSynthesis.speak(utterance);
}

/**
 * Pemutar Murottal asli (Mishary Rashid)
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
            btnElement.innerHTML = "🔊 Mengaji...";
            quranAudioPlayer.onended = () => btnElement.innerHTML = originalText;
        }
    } catch (e) { 
        btnElement.innerHTML = originalText;
        alert("Gagal memutar murottal.");
    }
}

// ==========================================
// 3. DASHBOARD & GEOLOCATION
// ==========================================

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
        }
    } catch (e) { console.error(e); }
}

async function autoDetectLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
            const data = await res.json();
            let city = data.address.city || data.address.town || data.address.regency || "Malang";
            loadPrayerDashboard(city.replace(/Kota|Kabupaten/gi, '').trim());
        }, () => loadPrayerDashboard(currentCity));
    } else { loadPrayerDashboard(currentCity); }
}

// ==========================================
// 4. CHAT LOGIC
// ==========================================

function saveMessageToSession(role, text) {
    if (!chatSessions[sessionId]) {
        chatSessions[sessionId] = { title: text.substring(0, 20) + "...", messages: [], timestamp: Date.now() };
    }
    chatSessions[sessionId].messages.push({ role, text });
    localStorage.setItem("ramadhan_chats", JSON.stringify(chatSessions));
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
    if (id === sessionId) startNewChat(); else renderSidebar();
}

function loadSession(id) {
    sessionId = id;
    const history = document.getElementById("chat-history");
    document.getElementById("welcome-screen").style.display = 'none';
    history.style.display = 'flex'; 
    history.innerHTML = "";
    chatSessions[id].messages.forEach(msg => {
        const wrapper = document.createElement("div");
        wrapper.className = msg.role === 'bot' ? "bot-message-wrapper" : "message user-message";
        const inner = document.createElement("div");
        inner.className = msg.role === 'bot' ? "message bot-message" : "";
        inner.innerHTML = formatMarkdown(msg.text);
        wrapper.appendChild(inner);
        history.appendChild(wrapper);
    });
    history.scrollTop = history.scrollHeight;
    renderSidebar();
}

function startNewChat() {
    sessionId = "session_" + Date.now();
    document.getElementById("chat-history").innerHTML = "";
    document.getElementById("chat-history").style.display = 'none';
    document.getElementById("welcome-screen").style.display = 'flex';
    renderSidebar();
}

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
    msgDiv.innerHTML = "Berpikir...";
    wrapper.appendChild(msgDiv);
    history.appendChild(wrapper);
    history.scrollTop = history.scrollHeight;

    const currentSession = chatSessions[sessionId] || { messages: [] };
    const historyPayload = currentSession.messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
    }));

    try {
        const response = await fetch("/api/chat", {
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, history: historyPayload })
        });
        const data = await response.json();
        if (data.status === "success") {
            msgDiv.innerHTML = formatMarkdown(data.reply);
            saveMessageToSession("bot", data.reply);
        } else {
            msgDiv.innerHTML = data.reply;
        }
    } catch (e) {
        msgDiv.innerHTML = "Gagal memuat jawaban.";
    }
}

function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("active");
    document.getElementById("sidebar-overlay").classList.toggle("active");
}

function quickChat(m) { 
    document.getElementById("user-input").value = m; 
    sendMessage(); 
}

function handleKeyPress(e) { if (e.key === "Enter") sendMessage(); }

window.onload = () => { 
    autoDetectLocation(); 
    renderSidebar(); 
};