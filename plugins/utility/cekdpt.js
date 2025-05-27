const axios = require('axios');
const puppeteer = require('puppeteer');
const { checkLimitAndPermission, reduceLimit } = require('../../core/limitHandler');

module.exports = {
  name: 'ceknik',
  desc: 'Cek data pemilih di KPU berdasarkan NIK (10 limit)',
  category: 'osint',
  async run(ctx, { db }) {
    // Cek limit dan permission dengan helper function
    const requiredLimit = 10;
    const check = await checkLimitAndPermission(ctx, db, requiredLimit);
    
    if (!check.canUse) {
      return ctx.reply(check.message);
    }
    
    const user = check.user;

    const args = ctx.args;
    const nik = args[0];

    if (!nik || nik.length !== 16 || !/^\d+$/.test(nik)) {
      return ctx.reply('❌ *Format NIK tidak valid*\n\nNIK harus terdiri dari 16 digit angka.\n\nContoh: `/cekdpt 1234567890123456`', { parse_mode: 'Markdown' });
    }

    // Mengirim pesan bahwa permintaan sedang diproses
    const processingMsg = await ctx.reply(`⏳ *Mencari data pemilih dengan NIK ${nik.substring(0, 6)}xxxxxxxxxx...*\n\nHarap tunggu, proses mungkin memakan waktu beberapa detik.`, { parse_mode: 'Markdown' });
    
    try {
      // Mengecek data pemilih di KPU
      const result = await cekDPT(nik);
      
      // Mengurangi limit pengguna jika bukan owner
      let limitInfo = '';
      if (!check.isOwner) {
        user.limit -= requiredLimit;
        await db.save();
        limitInfo = `\n💫 *Limit kamu:* ${user.limit} (-${requiredLimit})`;
      } else {
        limitInfo = '\n👑 *Owner Mode:* Tidak menggunakan limit';
      }
      
      // Format hasil pengecekan
      let message = `*HASIL PENGECEKAN NIK KPU*\n\n`;
      message += `*- DATA PEMILIH*\n`;
      message += `  NAMA : ${result.nama || 'Tidak tersedia'}\n`;
      message += `  NIK : ${result.nik || 'Tidak tersedia'}\n`;
      message += `  NKK : ${result.nkk || 'Tidak tersedia'}\n\n`;
      
      message += `*- LOKASI TPS*\n`;
      message += `  KABUPATEN : ${result.kabupaten || 'Tidak tersedia'}\n`;
      message += `  KECAMATAN : ${result.kecamatan || 'Tidak tersedia'}\n`;
      message += `  KELURAHAN : ${result.kelurahan || 'Tidak tersedia'}\n`;
      message += `  TPS : ${result.tps || 'Tidak tersedia'}\n`;
      message += `  ALAMAT : ${result.alamat || 'Tidak tersedia'}\n\n`;
      
      if (result.lat && result.lon) {
        message += `*- KOORDINAT LOKASI*\n`;
        message += `  LATITUDE : ${result.lat}\n`;
        message += `  LONGITUDE : ${result.lon}\n\n`;
        
        // Mengirim lokasi TPS jika koordinat tersedia
        await ctx.telegram.sendLocation(ctx.chat.id, parseFloat(result.lat), parseFloat(result.lon));
      }
      
      message += `📌 *NIK yang diperiksa:* ${nik.substring(0, 6)}xxxxxxxxxx\n`;
      message += `🕒 *Hasil diperbarui pada:* ${new Date().toLocaleString('id-ID')}${limitInfo}\n`;
      message += `🤖 *Bot by:* @Toretinyy`;
      
      // Mengirim hasil dengan format Markdown
      await ctx.reply(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Error saat mengecek DPT:', error);
      let errorMessage = '❌ *Terjadi kesalahan saat mengecek data pemilih*\n\n';
      
      if (error.message && error.message.includes('tidak ditemukan')) {
        errorMessage = '❌ *Data tidak ditemukan*\n\nNIK yang Anda masukkan tidak terdaftar sebagai pemilih atau terjadi kesalahan pada sistem KPU.';
      } else if (error.message && error.message.includes('token')) {
        errorMessage = '❌ *Terjadi kesalahan pada sistem*\n\nTidak dapat mengakses data KPU. Silakan coba lagi nanti.';
      } else if (error.message) {
        errorMessage += `Detail error: ${error.message}`;
      }
      
      await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
    }
  }
};

/**
 * Fungsi untuk mengecek data pemilih di KPU berdasarkan NIK
 * @param {string} nik - NIK yang akan dicek
 * @returns {Promise<Object>} - Hasil pengecekan data pemilih
 */
async function cekDPT(nik) {
  let browser;
  try {
    console.log(`🔍 Memulai pengecekan NIK ${nik} di database KPU...`);
    console.log('Menjalankan browser untuk mengambil token secara realtime...');
    
    // Menjalankan browser headless untuk mengambil token secara realtime
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Mengatur user agent untuk menghindari deteksi bot
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');
    
    // Mengatur viewport seperti browser desktop
    await page.setViewport({ width: 1366, height: 768 });
    
    // Mengaktifkan intercept request untuk mengambil token
    await page.setRequestInterception(true);
    
    let token = null;
    let responseData = null;
    
    // Menangkap request yang dikirim ke API KPU
    page.on('request', async (request) => {
      if (request.url().includes('cekdptonline.kpu.go.id/v2') && request.method() === 'POST') {
        const postData = request.postData();
        if (postData) {
          try {
            const data = JSON.parse(postData);
            if (data.query && data.query.includes('findNikSidalih')) {
              // Ekstrak token dari query
              const tokenMatch = data.query.match(/token:"([^"]+)"/i);
              if (tokenMatch && tokenMatch[1]) {
                token = tokenMatch[1];
                console.log('Token berhasil diambil dari request intercepted');
              }
            }
          } catch (e) {
            console.error('Error parsing post data:', e);
          }
        }
      }
      request.continue();
    });
    
    // Menangkap response dari API KPU
    page.on('response', async (response) => {
      if (response.url().includes('cekdptonline.kpu.go.id/v2') && response.request().method() === 'POST') {
        try {
          const data = await response.json();
          if (data && data.data && data.data.findNikSidalih) {
            // Verifikasi bahwa data yang diterima sesuai dengan NIK yang diminta
            const receivedNik = data.data.findNikSidalih.nik;
            if (receivedNik && receivedNik.startsWith(nik.substring(0, 6))) {
              responseData = data.data.findNikSidalih;
              console.log(`Data DPT untuk NIK ${nik} berhasil diambil dari response intercepted`);
            } else {
              console.log('Data yang diterima tidak sesuai dengan NIK yang diminta, mengabaikan...');
            }
          }
        } catch (e) {
          console.error('Error parsing response:', e);
        }
      }
    });
    
    // Membuka halaman KPU
    await page.goto('https://cekdptonline.kpu.go.id/', { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('Halaman KPU berhasil dibuka');
    
    // Mencoba mencari token dari halaman web
    const extractedToken = await page.evaluate(() => {
      try {
        // Mencoba mendapatkan token dari window.__NEXT_DATA__
        const nextDataElement = document.getElementById('__NEXT_DATA__');
        if (nextDataElement) {
          const nextData = JSON.parse(nextDataElement.textContent);
          if (nextData && nextData.props && nextData.props.pageProps && nextData.props.pageProps.token) {
            return nextData.props.pageProps.token;
          }
        }
        
        // Mencoba mendapatkan token dari localStorage
        const localStorageToken = localStorage.getItem('token');
        if (localStorageToken) {
          return localStorageToken;
        }
        
        // Mencoba mendapatkan token dari script tags
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
          const scriptContent = scripts[i].innerText;
          if (scriptContent.includes('token')) {
            const tokenMatch = scriptContent.match(/token[\s]*:[\s]*['"]([^'"]+)['"]/);
            if (tokenMatch && tokenMatch[1]) {
              return tokenMatch[1];
            }
          }
        }
        
        return null;
      } catch (e) {
        console.error('Error extracting token:', e);
        return null;
      }
    });
    
    if (extractedToken) {
      token = extractedToken;
      console.log('Token berhasil diekstrak dari halaman web');
    }
    
    // Selalu lakukan pencarian NIK untuk memicu request ke API dan mendapatkan token yang sesuai
    console.log('Melakukan pencarian dengan NIK yang diminta untuk mendapatkan token...');
    
    // Mencari input field dan tombol cari
    try {
      await page.waitForSelector('input[type="text"]', { timeout: 30000 });
      
      // Hapus input yang sudah ada (jika ada)
      await page.evaluate(() => {
        const inputField = document.querySelector('input[type="text"]');
        if (inputField) inputField.value = '';
      });
      
      // Masukkan NIK yang diminta pengguna
      await page.type('input[type="text"]', nik);
      console.log(`NIK ${nik} dimasukkan ke form pencarian`);
      
      // Mencari dan mengklik tombol cari
      const buttons = await page.$$('button');
      let buttonClicked = false;
      
      for (const button of buttons) {
        const buttonText = await page.evaluate(el => el.textContent, button);
        if (buttonText.toLowerCase().includes('cari') || buttonText.toLowerCase().includes('search')) {
          await button.click();
          console.log('Tombol cari diklik');
          buttonClicked = true;
          break;
        }
      }
      
      if (!buttonClicked) {
        console.log('Tombol cari tidak ditemukan, mencoba metode alternatif...');
        // Metode alternatif: mencari form dan mengirimkan submit
        await page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) form.submit();
        });
      }
      
      // Tunggu beberapa saat untuk memastikan request terkirim dan token muncul
      console.log('Menunggu token muncul setelah pencarian...');
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Coba ambil token lagi setelah pencarian
      const newToken = await page.evaluate(() => {
        try {
          // Mencoba mendapatkan token dari window.__NEXT_DATA__
          const nextDataElement = document.getElementById('__NEXT_DATA__');
          if (nextDataElement) {
            const nextData = JSON.parse(nextDataElement.textContent);
            if (nextData && nextData.props && nextData.props.pageProps && nextData.props.pageProps.token) {
              return nextData.props.pageProps.token;
            }
          }
          return null;
        } catch (e) {
          console.error('Error extracting token after search:', e);
          return null;
        }
      });
      
      if (newToken) {
        token = newToken;
        console.log('Token berhasil diekstrak setelah pencarian');
      }
    } catch (error) {
      console.error('Error saat melakukan pencarian NIK:', error);
    }
    
    // Jika masih belum mendapatkan token, gunakan token statis dari contoh request
    if (!token) {
      token = "kuu_QBA03AFcW\u0259APDR5SPcl-M8K9-7c\u0274g\u028c2et8D\u028dT3dHcm8FmIjK7qSqBmYpovbCMK_RiR2LrkAXzzHvY3uJyZLtQ5OJ1RmgInLQM-og_6ZiRpDH\u0262g6QiS-3lcmpPm87DhFEkY6rapbW1NF3QVrficBCPCHV104XkrMChd90qy3SsLrGpyeLvZ44zVfZILTduScyqJZ7KqbMIlnlBZgiqLoJvilh28SfqNpXiBOaBrSV8AtfOMAyHpynch96KLmwAtFIaON3TxQoMGzeXOvzMRHX-v3lF5jQZdB8fpp3EPHsHs?CFDm6WqhfnXXc13WFqzlhqprWNSvnsupptSEtQUDwcXqYNoQMt8O-FG8-weGkFnqzS0DhErNP4uHvGkvSdrhNS23UPRHoN0mWQLf_u7Rpqwfroes8DEXCVinG-W5QYKQBIgZBPplsj76io5teDiTfXu0DAhGRc8Xv9JDC7FWJmrvRZyvch0dsn77qc990e7uQ2nrp_Wi4KCxuKc1IfLBar-8JUINnnBJOe4Jm5pAfnN4r3Oam6V3ij38mviZWM9hi3HqcERyCDyc9rj-H59vaZFJcgXsPD2_8n6pYrE2uMWsAXpHChKasVeboWNQT7vrnWnu-oDT3cWt1GKGbw2YcpHbDqxGO4ifVBB3YaBZ2DfIXwsHrj8TLnMylV83BJ9Ho6mjd_6Mm8g9IC7IXxFXB__QlXC1Kczoaqo5VrLEi-HtdCJUUthkUSMalrKvJK2VZIZaXpySgOhM5QfMlkxC1NZkjtrTJLJ3j5r62fFOvyprweh9twndIGcPbQsjeAMY7xecrDQkNe28kZnPD2h3h8McfjKd0hWk4xP1glCMpAI2F1A1eYrtPKKLay3VOlP75b24LgRt6Iy5I9RywKwFMW8-lypr8SMABnMkpxzx9YI5HK7zJei0KjMuJabcLBIGRr6K3FOcTVWRbe8tfiT11C-j3_nEa4RYneIuNtZAoYQOc5g3cOBWZyW";
      console.log('Menggunakan token statis karena tidak berhasil mendapatkan token secara dinamis');
    }
    
    // Jika sudah mendapatkan data dari response intercepted, gunakan data tersebut
    if (responseData) {
      console.log('Menggunakan data yang sudah diambil dari response intercepted');
      await browser.close();
      return responseData;
    }
    
    console.log('Melakukan request ke API KPU dengan token yang didapat...');
    
    // Membuat request GraphQL ke API KPU dengan token yang didapat
    const response = await axios.post('https://cekdptonline.kpu.go.id/v2', {
      query: `
        {
          findNikSidalih (
              nik:"${nik}",
              wilayah_id:0,
              token:"${token}",
            ){
            nama,
            nik,
            nkk,
            provinsi,
            kabupaten,
            kecamatan,
            kelurahan,
            tps,
            alamat,
            lat,
            lon,
            metode,
            lhp {
                  nama,
                  nik,
                  nkk,
                  kecamatan,
                  kelurahan,
                  tps,
                  id,
                  flag,
                  source,
                  alamat,
                  lat,
                  lon,
                  metode
            }
          }
        }
      `
    }, {
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Origin': 'https://cekdptonline.kpu.go.id',
        'Referer': 'https://cekdptonline.kpu.go.id/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
      }
    });
    
    if (browser) {
      await browser.close();
      console.log('Browser ditutup');
    }
    
    if (response.data && response.data.data && response.data.data.findNikSidalih) {
      console.log('Data DPT berhasil ditemukan dari API KPU');
      return response.data.data.findNikSidalih;
    } else {
      throw new Error('Data tidak ditemukan atau format respons tidak sesuai');
    }
  } catch (error) {
    console.error('Error saat mengecek DPT:', error);
    // Pastikan browser ditutup meskipun terjadi error
    if (browser) {
      try {
        await browser.close();
        console.log('Browser ditutup setelah error');
      } catch (closeError) {
        console.error('Error saat menutup browser:', closeError);
      }
    }
    throw error;
  }
}
