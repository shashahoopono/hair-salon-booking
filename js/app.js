/**
 * 一人美髮工作室預約系統 - 客人查看頁面
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
    
    // 啟動時鐘：每秒更新一次
    setInterval(updateTimeOnly, 1000);
    updateTimeOnly(); 
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
        
        // --- 修正：置入帶有連結的 LINE 按鈕 ---
        if (settings.contact_line) {
            // 請記得將 @你的ID 換成真正的 ID
            const lineId = settings.contact_line.startsWith('@') ? settings.contact_line : `@${settings.contact_line}`;
            contactLineEl.innerHTML = `
                <a href="https://line.me/R/ti/p/${lineId}" target="_blank" style="text-decoration: none; color: inherit; display: flex; align-items: center; justify-content: center;">
                    <svg class="line-icon" viewBox="0 0 24 24" fill="#06C755" style="width: 24px; margin-right: 5px;">
                        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.349 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                    </svg> 
                    LINE: <span>點我加好友 (${settings.contact_line})</span>
                </a>
            `;
        }
    } catch (error) {
        console.log('使用預設設定:', error.message);
    }
}

/**
 * 自動更新當前時間
 */
function updateTimeOnly() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
        clockEl.textContent = `${hh}:${mm}:${ss}`;
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
        timeSlotsEl.innerHTML = '<p class="error">無法載入資料，請稍後再試</p>';
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
    const sortedTimes = [...bookedTimes].sort();
    timeSlotsEl.innerHTML = sortedTimes.map(time => `
        <div class="time-slot">
            <span class="time">${time}</span>
            <span class="status">已滿</span>
        </div>
    `).join('');
}