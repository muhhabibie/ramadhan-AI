/**
 * @fileoverview Frontend logic untuk Ramadhan AI.
 * Perbaikan pada pendeteksi tag Quran dan pemutar audio.
 */

let chatSessions = JSON.parse(localStorage.getItem("ramadhan_chats")) || {};
let sessionId = localStorage.getItem("current_session") || "session_" + Date.now();
let currentAbortController = null;
let quranAudioPlayer = null;

function formatMarkdown(text) {
    // 1. Perbaikan Regex: Menangkap tag [QURAN:1:1] atau [1:1] dengan lebih fleksibel
    const arabicRegex = /([\u0600-\u06FF][\u0600-\u06FF\s\.,،؛؟()'\-]*[\u0600-\u06FF])\s*(?:\[(?:QURAN:)?\s*(\d+)\s*:\s*(\d+)\s*\])?/gi;

    let html = text;

    // Basic Markdown
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^\* (.*$)/gim, '<div class="list-item">• $1</div>');
    
    // 2. Render Arab & Audio Button
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

async function playRealQuranAudio(surah, ayah, btnElement) {
    if (quranAudioPlayer) { quranAudioPlayer.pause(); }
    window.speechSynthesis.cancel();
    
    const originalText = btnElement.innerHTML;
    btnElement.innerHTML = "Memuat...";
    
    try {
        // Menggunakan API alquran.cloud untuk Murottal Mishary Rashid
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
        alert("Koneksi audio terputus, Akhi.");
    }
}

function playArabicAudio(text) {
    window.speechSynthesis.cancel();
    if (quranAudioPlayer) quranAudioPlayer.pause();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 0.8;
    window.speechSynthesis.speak(utterance);
}

// ... (Gunakan sisa fungsi sendMessage, saveMessage, dll dari kode Antum sebelumnya) ...
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
        msgDiv.innerHTML = "Gagal menghubungi server.";
    }
}