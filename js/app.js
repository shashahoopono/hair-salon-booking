/**
 * 一人美髮工作室預約系統 - 客人查看頁面
 * 讀取 Google Apps Script API，顯示已滿時段
 */


const API_URL = 'https://script.google.com/macros/s/AKfycbyhmLd4gvdmWJ6uAyRRQT9OyR6fse52fBZmRbQzhuk77jE4JAsnzqKtouXKcpU_aoQ/exec';

// 當前顯示的日期
let currentDate = new Date();

// DOM 元素
const shopNameEl = document.getElementById('shop-name');
const currentDateEl = document.getElementById('current-date');
const timeSlotsEl = document.getElementById('time-slots');
const contactPhoneEl = document.getElementById('contact-phone');
const contactLineEl = document.getElementById('contact-line');
const prevDayBtn = document.getElementById('prev-day');
const nextDayBtn = document.getElementById('next-day');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    updateDateDisplay();
    loadBookings();

    prevDayBtn.addEventListener('click', () => changeDate(-1));
    nextDayBtn.addEventListener('click', () => changeDate(1));
});

/**
 * 載入店家設定
 */
async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}?action=getSettings`);
        if (!response.ok) throw new Error('無法載入設定');

        const settings = await response.json();

        if (settings.shop_name) {
            shopNameEl.textContent = `✂️ ${settings.shop_name}`;
            document.title = `${settings.shop_name} - 已滿時段查詢`;
        }
        if (settings.contact_phone) {
            contactPhoneEl.innerHTML = `📞 <a href="tel:${settings.contact_phone.replace(/-/g, '')}">${settings.contact_phone}</a>`;
        }
        if (settings.contact_line) {
            contactLineEl.innerHTML = `💬 LINE: <span>${settings.contact_line}</span>`;
        }
    } catch (error) {
        console.log('使用預設設定:', error.message);
        // 使用 HTML 中的預設值
    }
}

/**
 * 檢查是否為今天
 */
function isToday(date) {
    const today = new Date();
    return date.getFullYear() === today.getFullYear() &&
           date.getMonth() === today.getMonth() &&
           date.getDate() === today.getDate();
}

/**
 * 更新日期顯示
 */
function updateDateDisplay() {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const month = currentDate.getMonth() + 1;
    const day = currentDate.getDate();
    const weekday = weekdays[currentDate.getDay()];

    if (isToday(currentDate)) {
        currentDateEl.innerHTML = `📅 ${month}月${day}日（${weekday}）<br><span class="today-badge">今日</span>`;
    } else {
        currentDateEl.textContent = `📅 ${month}月${day}日（${weekday}）`;
    }
}

/**
 * 切換日期
 */
function changeDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    updateDateDisplay();
    loadBookings();
}

/**
 * 格式化日期為 API 所需格式 (YYYY-MM-DD)
 */
function formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 載入已預約時段
 */
async function loadBookings() {
    timeSlotsEl.innerHTML = '<p class="loading">載入中...</p>';

    try {
        const dateStr = formatDateForAPI(currentDate);
        const response = await fetch(`${API_URL}?action=getBookings&date=${dateStr}`);

        if (!response.ok) throw new Error('無法載入預約資料');

        const data = await response.json();
        displayBookings(data.bookedTimes || []);
    } catch (error) {
        console.error('載入預約失敗:', error);

        // 如果 API 尚未設定，顯示提示訊息
        if (API_URL === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
            timeSlotsEl.innerHTML = `
                <p class="error">⚠️ 尚未設定 API</p>
                <p class="loading" style="font-size: 0.9rem; margin-top: 10px;">
                    請在 js/app.js 中設定<br>Google Apps Script URL
                </p>
            `;
        } else {
            timeSlotsEl.innerHTML = '<p class="error">無法載入資料，請稍後再試</p>';
        }
    }
}

/**
 * 顯示已預約時段
 */
function displayBookings(bookedTimes) {
    if (!bookedTimes || bookedTimes.length === 0) {
        timeSlotsEl.innerHTML = '<p class="no-bookings">✨ 目前無已滿時段</p>';
        return;
    }

    // 排序時段
    const sortedTimes = [...bookedTimes].sort();

    timeSlotsEl.innerHTML = sortedTimes.map(time => `
        <div class="time-slot">
            <span class="time">${time}</span>
            <span class="status">已滿</span>
        </div>
    `).join('');
}
