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

    // System Instruction dari kode Python Antum
    const systemInstruction = `Kamu adalah "RAMADHAN AI", asisten virtual dan pakar agama Islam yang cerdas. Hari ini: ${tanggal}.
    Gaya bahasa: Gunakan "Ana" (saya) dan "Antum" (kamu). Santai, bersahabat, namun tetap berwibawa.

    === KEMAMPUAN UTAMA ===
    1. JAWABAN MENDALAM: Berikan penjelasan komprehensif (hikmah, maqashid syariah).
    2. SUMBER VALID: Quran, Hadits, Ijma, Qiyas. Sertakan Teks Arab, Latin, dan Arti.

    === BATASAN KETAT ===
    1. TOLAK semua pertanyaan non-Islam (politik, coding, matematika, dll) dengan santun.

    === ATURAN FORMATTING AL-QURAN (WAJIB!) ===
    1. Tag [QURAN:Surah:Ayat] HARUS MENEMPEL DI BARIS YANG SAMA dengan Teks Arab!
    2. DILARANG menaruh tag di bawah teks Latin/Arti atau menggunakan bintang (*) pada Latin.`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction: systemInstruction
            });

            // Trim history (max 10 pesan) seperti di Python
            const trimmedHistory = history.length > 10 ? history.slice(-10) : history;

            const chat = model.startChat({
                history: trimmedHistory,
                generationConfig: { maxOutputTokens: 2000 }
            });

            const result = await chat.sendMessage(message);
            const response = await result.response;
            let resText = response.text();

            // Deteksi Kota untuk Dashboard
            let cityFound = null;
            if (resText.includes("CITY_DETECTED:")) {
                const parts = resText.split("|");
                cityFound = parts[0].replace("CITY_DETECTED:", "").trim();
                resText = parts[1] || resText;
            }

            return res.status(200).json({ status: "success", reply: resText, detected_city: cityFound });
        } catch (error) {
            console.error(`Error pada model ${modelName}:`, error);
            // Jika error karena quota (429), lanjut ke model berikutnya
            if (error.message.includes("429") || error.status === 429) continue;

            // Kirim pesan error yang lebih informatif ke frontend untuk debugging
            return res.status(500).json({
                status: "error",
                reply: "Afwan, ada kendala teknis pada mesin AI. Detail: " + (error.message || "Unknown Error")
            });
        }
    }

    res.status(200).json({ status: "error", reply: "Afwan Akhi, limit harian habis. Coba lagi nanti." });
};