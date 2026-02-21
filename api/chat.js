const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = async (req, res) => {
    // CORS configuration
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { message, history = [] } = req.body;
    const tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    // === HARDCODED API KEY UNTUK DEBUGGING ===
    // Kunci diambil langsung dari image_9658a6.png
    const hardcodedKey = "AIzaSyAlcNDMcKKJN9qHTZzpzer-W2WGVTKLKtw"; 
    console.log(`[DEBUG] Menggunakan Hardcoded Key: ${hardcodedKey.substring(0, 4)}...${hardcodedKey.slice(-4)}`);
    // =========================================

    const systemInstruction = `Kamu adalah "RAMADHAN AI", asisten virtual pakar agama Islam yang cerdas dan gaul. Hari ini: ${tanggal}.
    Gaya bahasa: Gunakan "Ana" (saya) dan "Antum" (kamu). Santai, bersahabat, namun tetap berwibawa.

    === PERATURAN KHUSUS (PENTING!) ===
    1. Jika Antum ditanya hal di luar konteks agama Islam (politik, bola, artis, coding, dll), jawab dengan kalimat: 
       "Ente kadang-kadang ente... Ana ini asisten virtual khusus persoalan agama, bukan pengamat [sebutkan topik yang ditanyakan]. Tanya seputar ibadah aja barakallahu fiik."
    2. Tetap interaktif dan jangan terlalu kaku. Jika pertanyaan relevan, berikan penjelasan yang mendalam.
    3. Jika pertanyaan menyangkut Al-Qur'an, sertakan teks Arab dan terjemahan. Gunakan tag [QURAN:Surah:Ayat] tepat setelah teks Arab!

    === ATURAN FORMATTING AL-QURAN ===
    1. Tag [QURAN:Surah:Ayat] HARUS MENEMPEL DI BARIS YANG SAMA dengan Teks Arab!
    2. Contoh: (Teks Arab) [QURAN:1:1]`;

    // Menggunakan kunci yang di-hardcode
    const genAI = new GoogleGenerativeAI(hardcodedKey);
    const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                systemInstruction: systemInstruction 
            });

            const chat = model.startChat({
                history: history.slice(-10),
                generationConfig: { maxOutputTokens: 2000, temperature: 0.7 }
            });

            const result = await chat.sendMessage(message);
            const response = await result.response;
            return res.status(200).json({ status: "success", reply: response.text() });

        } catch (error) {
            console.error(`Error pada model ${modelName}:`, error.message);
            if (error.status === 429 || error.message.includes("429")) continue; 
            
            return res.status(200).json({ 
                status: "error", 
                reply: "Afwan Akhi, sepertinya ada kendala teknis. Detail: " + error.message 
            });
        }
    }
    res.status(200).json({ status: "error", reply: "Afwan Akhi, kuota API ini juga sedang limit. Coba lagi nanti ya." });
};