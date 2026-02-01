/**
 * 一人美髮工作室預約系統 - 客人查看頁面
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbyhmLd4gvdmWJ6uAyRRQT9OyR6fse52fBZmRbQzhuk77jE4JAsnzqKtouXKcpU_aoQ/exec';

let currentDate = new Date();

// DOM 元素
const shopNameEl = document.getElementById('shop-name');
const currentDateEl = document.getElementById('current-date');
const timeSlotsEl = document.getElementById('time-slots');
const contactPhoneEl = document.getElementById('contact-phone');
const contactLineEl = document.getElementById('contact-line');
const prevDayBtn = document.getElementById('prev-day');
const nextDayBtn = document.getElementById('next-day');
const refreshBtn = document.getElementById('refresh-btn');

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    updateDateDisplay();
    loadBookings();

    // 按鈕事件
    prevDayBtn.addEventListener('click', () => changeDate(-1));
    nextDayBtn.addEventListener('click', () => changeDate(1));
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadBookings();
            loadSettings();
        });
    }

    // 每秒更新時鐘
    setInterval(updateTimeOnly, 1000);
    updateTimeOnly(); 

    // 每 5 分鐘自動刷新預約狀態
    setInterval(loadBookings, 300000); 
});

/**
 * 載入店家設定 (含電話與 LINE 連結處理)
 */
async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}?action=getSettings`);
        if (!response.ok) throw new Error('無法載入設定');
        const settings = await response.json();

        // 1. 店名
        if (settings.shop_name) {
            shopNameEl.textContent = `✂️ ${settings.shop_name}`;
            document.title = `${settings.shop_name} - 已滿時段查詢`;
        }
        
        // 2. 電話
        if (settings.contact_phone) {
            const purePhone = settings.contact_phone.replace(/[^\d]/g, '');
            contactPhoneEl.innerHTML = `📞 <a href="tel:${purePhone}" style="text-decoration: none; color: #007bff; font-weight: bold;">${settings.contact_phone}</a>`;
        }
        
        // 3. LINE (保持連結正確，但不顯示醜醜的網址)
        if (settings.contact_line) {
            // 自動過濾掉 ID 裡的 @ 並移除空格
            const cleanId = settings.contact_line.replace('@', '').trim();
            const lineLink = `https://line.me/ti/p/~${cleanId}`;
            
            contactLineEl.innerHTML = `
                <a href="${lineLink}" target="_blank" style="text-decoration: none; color: inherit; display: flex; align-items: center; justify-content: center;">
                    <svg class="line-icon" viewBox="0 0 24 24" fill="#06C755" style="width: 24px; margin-right: 8px;">
                        <path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                    </svg> 
                    <span style="color: #06C755; font-weight: bold; font-size: 1.1rem;">LINE 預約 (@${cleanId})</span>
                </a>
            `;
        }
        
    } catch (error) {
        console.error('設定載入失敗:', error);
        // 如果 API 失敗，至少顯示備用的 ID 
        contactLineEl.innerHTML = `LINE ID: @hgoo327257 (請手動搜尋)`;
    }
}

/**
 * 時鐘
 */
function updateTimeOnly() {
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
        clockEl.textContent = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    }
}

/**
 * 日期顯示
 */
function updateDateDisplay() {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const month = currentDate.getMonth() + 1;
    const day = currentDate.getDate();
    const weekday = weekdays[currentDate.getDay()];
    const isToday = new Date().toDateString() === currentDate.toDateString();
    
    currentDateEl.innerHTML = `📅 ${month}月${day}日（${weekday}）${isToday ? '<br><span class="today-badge" style="background: #ff4d4d; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">今日</span>' : ''}`;
}

function changeDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    updateDateDisplay();
    loadBookings();
}

/**
 * 載入 API 預約資料
 */
async function loadBookings() {
    timeSlotsEl.innerHTML = '<p class="loading">載入中...</p>';
    try {
        const dateStr = currentDate.toISOString().split('T')[0];
        const response = await fetch(`${API_URL}?action=getBookings&date=${dateStr}`);
        const data = await response.json();
        displayBookings(data.bookedTimes || []);
    } catch (error) {
        timeSlotsEl.innerHTML = '<p class="error">載入失敗</p>';
    }
}

function displayBookings(bookedTimes) {
    if (!bookedTimes || bookedTimes.length === 0) {
        timeSlotsEl.innerHTML = '<p class="no-bookings">✨ 目前無已滿時段</p>';
        return;
    }
    timeSlotsEl.innerHTML = [...bookedTimes].sort().map(time => `
        <div class="time-slot" style="background: #f8f9fa; border: 1px solid #eee; padding: 10px; margin: 5px; border-radius: 5px; display: flex; justify-content: space-between;">
            <span class="time" style="font-weight: bold; color: #333;">${time}</span>
            <span class="status" style="color: #d9534f;">● 已滿</span>
        </div>
    `).join('');
}