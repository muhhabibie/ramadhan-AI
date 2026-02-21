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

    const systemInstruction = `Kamu adalah "RAMADHAN AI", asisten virtual pakar agama Islam. Hari ini: ${tanggal}.
    Gaya bahasa: Gunakan "Ana" (saya) dan "Antum" (kamu). Santai, bersahabat, namun tetap berwibawa.

    === ATURAN FORMATTING AL-QURAN (WAJIB!) ===
    1. Tag [QURAN:Surah:Ayat] HARUS MENEMPEL DI BARIS YANG SAMA dengan Teks Arab!
    2. Contoh: (Teks Arab) [QURAN:1:1]
    3. Jika itu Hadits/Doa, jangan beri tag QURAN agar sistem menggunakan suara AI biasa.`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // GANTI: Model harus valid (2.5-flash sangat stabil saat ini)
    const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                systemInstruction: systemInstruction 
            });

            const trimmedHistory = history.length > 10 ? history.slice(-10) : history;
            const chat = model.startChat({
                history: trimmedHistory,
                generationConfig: { maxOutputTokens: 2000 }
            });

            const result = await chat.sendMessage(message);
            const response = await result.response;
            return res.status(200).json({ status: "success", reply: response.text() });

        } catch (error) {
            console.error(`Error pada model ${modelName}:`, error);
            if (error.status === 429) continue; // Coba model berikutnya jika limit
            return res.status(500).json({ status: "error", reply: "Afwan, sistem sedang lelah. Detail: " + error.message });
        }
    }
    res.status(200).json({ status: "error", reply: "Afwan Akhi, limit harian habis. Coba lagi nanti." });
};