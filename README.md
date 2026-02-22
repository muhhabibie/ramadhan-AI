# RAMADHAN AI

**RAMADHAN AI** adalah asisten virtual cerdas berbasis web yang dirancang khusus untuk membantu umat Muslim menjawab pertanyaan seputar agama Islam, ibadah, dan puasa. Dibangun menggunakan teknologi **Google Gemini AI**, aplikasi ini menyajikan jawaban yang interaktif, akurat, dan dilengkapi dengan fitur audio Murottal Al-Qur'an asli serta jadwal sholat *real-time*.

---

##  Tangkapan Layar UI (Screenshots)

<img width="2559" height="1463" alt="Screenshot 2026-02-22 164818" src="https://github.com/user-attachments/assets/96d6f8c8-49d5-425b-ae62-4a29ace5b98d" />

##  Fitur Utama

- **Asisten Cerdas Islami**: Menjawab pertanyaan seputar fiqih, sejarah, dan ibadah dengan gaya bahasa yang bersahabat.
- **Deteksi Al-Qur'an Otomatis**: Jika AI mengutip ayat, sistem otomatis menampilkannya dalam format teks Arab yang indah (*font* Amiri).
-  **Pemutar Murottal Asli**: Dilengkapi tombol khusus untuk memutar suara Qari asli (Mishary Rashid Alafasy) langsung dari ayat yang ditampilkan.
-  **Suara AI (TTS) untuk Hadits/Doa**: Membacakan teks Arab non-Qur'an (seperti doa atau hadits) menggunakan teknologi *Text-to-Speech*.
-  **Jadwal Sholat Real-time**: Mendeteksi lokasi pengguna secara otomatis menggunakan Geolocation dan menampilkan jadwal sholat 5 waktu akurat.
- **Kontrol Generate**: Terdapat tombol "Stop" untuk menghentikan AI saat mengetik, dan tombol "Retry" untuk mengulang pertanyaan.
- **UI/UX Modern**: Menggunakan desain *Glassmorphism* bertema gelap (Dark Mode) dengan aksen warna emas (*Gold*) yang elegan dan responsif di perangkat *mobile*.

## Teknologi yang Digunakan

- **Frontend:** HTML5, CSS3 (Flexbox/Grid, Glassmorphism), Vanilla JavaScript.
- **Backend:** Node.js (Vercel Serverless Functions).
- **AI Model:** Google Generative AI (Gemini 2.5 Flash / Gemini 2.0 Flash).
- **Eksternal API:**
  - [Alquran Cloud API](https://alquran.cloud/api) (Untuk audio murottal).
  - [Aladhan API](https://aladhan.com/prayer-times-api) (Untuk jadwal sholat).
  - [Nominatim OpenStreetMap](https://nominatim.org/) (Untuk *Reverse Geocoding* lokasi).

## Cara Menjalankan Secara Lokal (Local Development)

### Persyaratan
- Node.js terinstal di komputer.
- Memiliki API Key dari Google AI Studio.

### Langkah-langkah
1. **Clone repositori ini:**
   ```bash
   git clone [https://github.com/username-antum/ramadhan-ai.git](https://github.com/username-antum/ramadhan-ai.git)
   cd ramadhan-ai

   Instal dependensi (jika menggunakan package.json):

Bash
npm install
(Catatan: Pastikan package @google/generative-ai terinstal)

Atur Environment Variables:
Buat file bernama .env di root directory (sejajar dengan folder api atau js), lalu tambahkan API Key Antum:

Cuplikan kode
GEMINI_API_KEY=masukkan_api_key_google_gemini_disini
Jalankan aplikasi:
Karena menggunakan Vercel Serverless Functions, sangat disarankan menggunakan Vercel CLI untuk testing lokal:

Bash
npm i -g vercel
vercel dev
Aplikasi akan berjalan di http://localhost:3000.

(Disclaimer)
Aplikasi ini menggunakan model generatif teks AI. Meskipun instruksi (system prompt) telah diatur secara ketat untuk konteks keislaman, AI dapat melakukan kesalahan (halusinasi). Jawaban terkait hukum agama (fatwa) yang rumit sebaiknya tetap dikonsultasikan kepada ustadz atau ulama yang berkompeten.
