/**
 * @fileoverview Frontend logic untuk Ramadhan AI.
 * Fitur: Efek mengetik, Pembeda audio Quran vs Hadits, Geolocation, Stop & Retry.
 */

// ==========================================
// 1. GLOBAL STATE
// ==========================================
let chatSessions = JSON.parse(localStorage.getItem("ramadhan_chats")) || {};
let sessionId = localStorage.getItem("current_session") || "session_" + Date.now();
let currentAbortController = null;
let currentCity = localStorage.getItem("user_city") || "Malang";
let quranAudioPlayer = null;
let cancelTyping = false; // Flag untuk menghentikan efek ngetik

// ==========================================
// 2. CORE UTILS (Markdown & Audio)
// ==========================================

function formatMarkdown(text) {
    let html = text;

    // 1. Format basic markdown (Bold, Heading, List)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^(#{1,6})\s+(.*$)/gim, '<h3 class="chat-heading">$2</h3>');
    html = html.replace(/^\* (.*$)/gim, '<div class="list-item">• $1</div>');
    
    // 2. Regex Baru: Tangkap teks Arab, dan TANGKAP JUGA tag [QURAN:x:y] yang menempel setelahnya
    const arabicWithTagRegex = /([\u0600-\u06FF][\u0600-\u06FF\s\.,،؛؟()'\-]*[\u0600-\u06FF])(?:\s*\[QURAN:\s*(\d+)\s*:\s*(\d+)\s*\])?/gi;

    html = html.replace(arabicWithTagRegex, function(match, arabicText, surah, ayah) {
        // Jika regex berhasil menangkap angka surah dan ayat di sebelah teks Arab spesifik ini
        if (surah && ayah) {
            return `
            <div class="arabic-container">
                <div class="arabic-text" dir="rtl">${arabicText}</div>
                <button class="play-audio-btn" onclick="playRealQuranAudio(${surah}, ${ayah}, this)">▶ Putar Murottal Asli</button>
                <small class="audio-notice">✨ Suara asli Qari tersedia untuk ayat Al-Quran</small>
            </div>`;
        } else {
            // Jika tidak ada tag QURAN, jadikan Suara AI
            const encodedText = encodeURIComponent(arabicText);
            return `
            <div class="arabic-container">
                <div class="arabic-text" dir="rtl">${arabicText}</div>
                <button class="play-audio-btn" onclick="playArabicAudio(decodeURIComponent('${encodedText}'))">▶ Putar Suara (AI)</button>
                <small class="audio-notice">ℹ️ Suara Qari asli hanya tersedia untuk Al-Quran. Hadits/Doa menggunakan AI.</small>
            </div>`;
        }
    });
    
    // 3. Bersihkan sisa tag QURAN agar UI tetap rapi
    html = html.replace(/\[QURAN:\s*\d+\s*:\s*\d+\s*\]/gi, '');

    return html.replace(/\n/g, '<br>');
}
/**
 * Efek Mengetik (Typing Effect)
 */
function typeMessage(element, text) {
    return new Promise((resolve) => {
        let i = 0; 
        let html = formatMarkdown(text);
        let isTag = false;
        element.innerHTML = "";
        cancelTyping = false; // Reset variabel setiap kali mulai ngetik
        
        function type() {
            // JIKA TOMBOL STOP DITEKAN, BERHENTIKAN LOOPING
            if (cancelTyping) { resolve(); return; }
            
            if (i < html.length) {
                let char = html.charAt(i);
                if (char === '<') isTag = true;
                if (char === '>') { isTag = false; i++; type(); return; }
                
                if (isTag) { 
                    i++; type(); 
                } else {
                    element.innerHTML = html.substring(0, i + 1);
                    i++;
                    setTimeout(type, 15); // Kecepatan mengetik
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

/**
 * Pemutar Murottal Asli
 */
async function playRealQuranAudio(surah, ayah, btnElement) {
    if (quranAudioPlayer) { quranAudioPlayer.pause(); quranAudioPlayer.currentTime = 0; }
    window.speechSynthesis.cancel();
    
    const originalText = btnElement.innerHTML;
    const originalDisabled = btnElement.disabled;
    btnElement.innerHTML = "⏳ Memuat...";
    btnElement.disabled = true;
    
    try {
        const res = await fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ar.alafasy`);
        const json = await res.json();
        console.log("API Response:", json);
        
        if(json.code === 200 && json.data.audio) {
            quranAudioPlayer = new Audio();
            // CROSSORIGIN DIHAPUS AGAR TIDAK DIBLOKIR BROWSER
            quranAudioPlayer.preload = "auto";
            
            // PAKSA AUDIO MENGGUNAKAN HTTPS UNTUK MENCEGAH MIXED CONTENT DI VERCEL
            let audioUrl = json.data.audio;
            if (audioUrl.startsWith('http://')) {
                audioUrl = audioUrl.replace('http://', 'https://');
            }
            
            quranAudioPlayer.addEventListener('canplay', () => {
                console.log("Audio siap diputar");
                btnElement.innerHTML = "🔊 Sedang Mengaji...";
            }, { once: true });
            
            quranAudioPlayer.addEventListener('error', (e) => {
                console.error("Audio Error:", e, e.target.error);
                btnElement.innerHTML = originalText;
                btnElement.disabled = originalDisabled;
                alert("⚠️ Tidak bisa memutar audio. Cek koneksi internet Antum.");
            });
            
            quranAudioPlayer.addEventListener('ended', () => {
                btnElement.innerHTML = originalText;
                btnElement.disabled = originalDisabled;
            });
            
            // Set source ke HTTPS URL
            quranAudioPlayer.src = audioUrl;
            quranAudioPlayer.load();
            console.log("Audio loading dari:", audioUrl);
            
            const playPromise = quranAudioPlayer.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log("Audio playback started successfully");
                    })
                    .catch(error => {
                        console.error("Play Error:", error.name, error.message);
                        btnElement.innerHTML = originalText;
                        btnElement.disabled = originalDisabled;
                        
                        if (error.name === 'NotAllowedError') {
                            alert("⚠️ Browser memblokir autoplay. Ketuk button lagi ya!");
                        } else {
                            alert("⚠️ Tidak bisa memutar audio: " + error.message);
                        }
                    });
            }
        } else {
            btnElement.innerHTML = originalText;
            btnElement.disabled = originalDisabled;
            alert("Audio tidak tersedia untuk ayat ini.");
        }
    } catch (e) { 
        console.error("Fetch Error:", e);
        btnElement.innerHTML = originalText;
        btnElement.disabled = originalDisabled;
        alert("Gagal memutar murottal: " + e.message);
    }
}

/**
 * Suara AI (TTS)
 */
function playArabicAudio(text) {
    window.speechSynthesis.cancel();
    if (quranAudioPlayer) quranAudioPlayer.pause();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 0.85; 
    window.speechSynthesis.speak(utterance);
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

// ==========================================
// 5. FETCH RESPONSE & ACTIONS (STOP/RETRY)
// ==========================================

async function fetchBotResponse(message) {
    const history = document.getElementById("chat-history");
    const wrapper = document.createElement("div");
    wrapper.className = "bot-message-wrapper";
    
    const msgDiv = document.createElement("div");
    msgDiv.className = "message bot-message";
    msgDiv.innerHTML = "Berpikir...";
    
    // CONTAINER TOMBOL ACTION (Stop/Retry)
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "message-actions";
    actionsDiv.innerHTML = `<button class="action-btn stop-btn" onclick="stopBot()">🛑 Stop</button>`;
    
    wrapper.appendChild(msgDiv);
    wrapper.appendChild(actionsDiv);
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
            body: JSON.stringify({ message, history: historyPayload }),
            signal: currentAbortController.signal
        });
        
        const data = await response.json();
        
        if (data.status === "success") {
            await typeMessage(msgDiv, data.reply);
            
            // Hanya save ke history jika tidak di-stop paksa
            if (!cancelTyping) saveMessageToSession("bot", data.reply);
            
            // Ubah tombol Stop menjadi Retry setelah selesai
            actionsDiv.innerHTML = `<button class="action-btn" onclick="retryMessage('${message.replace(/'/g, "\\'")}', this)">🔄 Retry</button>`;
        } else {
            msgDiv.innerHTML = data.reply;
            actionsDiv.innerHTML = `<button class="action-btn" onclick="retryMessage('${message.replace(/'/g, "\\'")}', this)">🔄 Retry</button>`;
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            msgDiv.innerHTML += "<br><br><em>[Generate dihentikan...]</em>";
        } else {
            msgDiv.innerHTML = "Waduh, koneksi terputus. Coba lagi ya.";
        }
        actionsDiv.innerHTML = `<button class="action-btn" onclick="retryMessage('${message.replace(/'/g, "\\'")}', this)">🔄 Retry</button>`;
    } finally {
        currentAbortController = null;
    }
}

// FUNGSI UNTUK TOMBOL STOP
function stopBot() {
    if (currentAbortController) {
        currentAbortController.abort(); // Batalkan request internet
    }
    cancelTyping = true; // Hentikan efek mengetik
}

// FUNGSI UNTUK TOMBOL RETRY
function retryMessage(originalMessage, btnElement) {
    // 1. Hapus bubble chat bot yang gagal/dihentikan ini
    const wrapper = btnElement.closest('.bot-message-wrapper');
    if(wrapper) wrapper.remove();
    
    // 2. Tembak ulang requestnya dengan pesan yang sama
    fetchBotResponse(originalMessage);
}

// ==========================================
// 6. UI TOGGLES & LISTENERS
// ==========================================

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