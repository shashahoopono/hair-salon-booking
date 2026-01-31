/**
 * 一人美髮工作室預約系統 - Google Apps Script
 * 功能：LINE Webhook + Sheet API
 */

// ⚠️ 請替換為你的設定
const LINE_CHANNEL_ACCESS_TOKEN = 'YOUR_LINE_CHANNEL_ACCESS_TOKEN';
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';

// Sheet 名稱
const SHEET_BOOKINGS = 'Bookings';
const SHEET_SERVICES = 'Services';
const SHEET_SETTINGS = 'Settings';

// 服務時長對照表（分鐘）- 備用，優先使用 Sheet 中的設定
const DEFAULT_SERVICE_DURATION = {
  '剪': 20,
  '剪髮': 20,
  '洗剪': 30,
  '補染': 90,
  '全染': 120,
  '染髮': 120,
  '染': 120,
  '燙': 150,
  '燙髮': 150,
  '染燙': 210,
  '護髮': 60,
  '護': 60
};

/**
 * HTTP GET 請求處理 - 給網頁讀取資料
 */
function doGet(e) {
  const action = e.parameter.action;

  let result;
  switch (action) {
    case 'getBookings':
      result = getBookingsByDate(e.parameter.date);
      break;
    case 'getSettings':
      result = getSettings();
      break;
    default:
      result = { error: 'Unknown action' };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * HTTP POST 請求處理 - LINE Webhook
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const events = data.events;

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        handleMessage(event);
      }
    }
  } catch (error) {
    console.error('doPost error:', error);
  }

  return ContentService.createTextOutput('OK');
}

/**
 * 處理 LINE 訊息
 */
function handleMessage(event) {
  const message = event.message.text.trim();
  const replyToken = event.replyToken;

  if (message.startsWith('預約')) {
    handleBooking(message, replyToken);
  } else if (message.startsWith('取消')) {
    handleCancel(message, replyToken);
  } else if (message.startsWith('查詢')) {
    handleQuery(message, replyToken);
  }
  // 其他訊息不回應
}

/**
 * 處理預約訊息
 * 格式：預約 2/1 10:00 王小姐 0912345678 剪髮
 */
function handleBooking(message, replyToken) {
  try {
    const parts = message.split(/\s+/);

    if (parts.length < 5) {
      replyMessage(replyToken, '❌ 格式錯誤\n\n正確格式：\n預約 日期 時間 姓名 電話 服務\n\n範例：\n預約 2/1 10:00 王小姐 0912345678 剪髮');
      return;
    }

    const dateStr = parts[1];     // 2/1 或 2026/2/1
    const time = parts[2];        // 10:00
    const name = parts[3];        // 王小姐
    const phone = parts[4];       // 0912345678
    const service = parts[5] || '未指定';  // 剪髮

    // 解析日期
    const date = parseDate(dateStr);
    if (!date) {
      replyMessage(replyToken, '❌ 日期格式錯誤\n\n請使用：月/日 或 年/月/日\n範例：2/1 或 2026/2/1');
      return;
    }

    // 驗證時間格式
    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      replyMessage(replyToken, '❌ 時間格式錯誤\n\n請使用：時:分\n範例：10:00 或 9:30');
      return;
    }

    // 取得服務時長
    const duration = getDuration(service);
    const endTime = calculateEndTime(time, duration);
    const occupiedSlots = getOccupiedSlots(time, duration);

    // 檢查是否有衝突
    const conflicts = checkConflicts(date, occupiedSlots);
    if (conflicts.length > 0) {
      replyMessage(replyToken, `⚠️ 時段衝突\n\n${conflicts.join('、')} 已有預約`);
      return;
    }

    // 寫入 Sheet
    addBooking(date, time, endTime, name, phone, service, duration, occupiedSlots.join(','));

    // 格式化回覆
    const formattedDate = formatDateDisplay(date);
    const durationText = formatDuration(duration);

    replyMessage(replyToken,
      `✅ 已登記\n${formattedDate} ${time} ~ ${endTime}\n${name} ${service}（${durationText}）`
    );

  } catch (error) {
    console.error('handleBooking error:', error);
    replyMessage(replyToken, '❌ 處理失敗，請稍後再試');
  }
}

/**
 * 處理取消訊息
 * 格式：取消 2/1 10:00
 */
function handleCancel(message, replyToken) {
  try {
    const parts = message.split(/\s+/);

    if (parts.length < 3) {
      replyMessage(replyToken, '❌ 格式錯誤\n\n正確格式：\n取消 日期 時間\n\n範例：\n取消 2/1 10:00');
      return;
    }

    const dateStr = parts[1];
    const time = parts[2];

    const date = parseDate(dateStr);
    if (!date) {
      replyMessage(replyToken, '❌ 日期格式錯誤');
      return;
    }

    // 查找並刪除預約
    const deleted = deleteBooking(date, time);

    if (deleted) {
      const formattedDate = formatDateDisplay(date);
      replyMessage(replyToken, `✅ 已取消\n${formattedDate} ${time} 的預約`);
    } else {
      replyMessage(replyToken, '❌ 找不到該時段的預約');
    }

  } catch (error) {
    console.error('handleCancel error:', error);
    replyMessage(replyToken, '❌ 處理失敗，請稍後再試');
  }
}

/**
 * 處理查詢訊息
 * 格式：查詢 2/1
 */
function handleQuery(message, replyToken) {
  try {
    const parts = message.split(/\s+/);
    const dateStr = parts[1] || getTodayString();

    const date = parseDate(dateStr);
    if (!date) {
      replyMessage(replyToken, '❌ 日期格式錯誤');
      return;
    }

    const bookings = getBookingsForDisplay(date);
    const formattedDate = formatDateDisplay(date);

    if (bookings.length === 0) {
      replyMessage(replyToken, `📅 ${formattedDate}\n\n目前無預約`);
    } else {
      const list = bookings.map(b =>
        `${b.time} ~ ${b.endTime}\n${b.name} ${b.service}`
      ).join('\n\n');
      replyMessage(replyToken, `📅 ${formattedDate}\n\n${list}`);
    }

  } catch (error) {
    console.error('handleQuery error:', error);
    replyMessage(replyToken, '❌ 處理失敗，請稍後再試');
  }
}

// ========== 日期時間處理 ==========

/**
 * 解析日期字串
 * 支援格式：2/1, 02/01, 2026/2/1, 2026-02-01
 */
function parseDate(dateStr) {
  const today = new Date();
  let year, month, day;

  // 嘗試解析不同格式
  if (dateStr.includes('-')) {
    // 2026-02-01
    const parts = dateStr.split('-');
    year = parseInt(parts[0]);
    month = parseInt(parts[1]);
    day = parseInt(parts[2]);
  } else if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      // 2026/2/1
      year = parseInt(parts[0]);
      month = parseInt(parts[1]);
      day = parseInt(parts[2]);
    } else if (parts.length === 2) {
      // 2/1
      year = today.getFullYear();
      month = parseInt(parts[0]);
      day = parseInt(parts[1]);

      // 如果日期已過，自動跳到明年
      const testDate = new Date(year, month - 1, day);
      if (testDate < today) {
        testDate.setDate(testDate.getDate()); // 保持當年，不自動跳年
      }
    }
  }

  if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }

  return formatDateISO(year, month, day);
}

/**
 * 格式化日期為 ISO 格式 (YYYY-MM-DD)
 */
function formatDateISO(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 格式化日期為顯示格式
 */
function formatDateDisplay(dateStr) {
  const parts = dateStr.split('-');
  const month = parseInt(parts[1]);
  const day = parseInt(parts[2]);
  const date = new Date(parseInt(parts[0]), month - 1, day);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${month}月${day}日（${weekdays[date.getDay()]}）`;
}

/**
 * 取得今天的日期字串
 */
function getTodayString() {
  const today = new Date();
  return formatDateISO(today.getFullYear(), today.getMonth() + 1, today.getDate());
}

/**
 * 計算結束時間
 */
function calculateEndTime(startTime, durationMinutes) {
  const [hours, mins] = startTime.split(':').map(Number);
  const totalMins = hours * 60 + mins + durationMinutes;
  const endHours = Math.floor(totalMins / 60);
  const endMins = totalMins % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
}

/**
 * 產生佔用的時段列表（每 30 分鐘一格）
 */
function getOccupiedSlots(startTime, durationMinutes) {
  const slots = [];
  const [hours, mins] = startTime.split(':').map(Number);
  let currentMins = hours * 60 + mins;
  const endMins = currentMins + durationMinutes;

  while (currentMins < endMins) {
    const h = Math.floor(currentMins / 60);
    const m = currentMins % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    currentMins += 30;
  }
  return slots;
}

/**
 * 格式化時長顯示
 */
function formatDuration(minutes) {
  if (minutes >= 60) {
    const hours = minutes / 60;
    if (hours === Math.floor(hours)) {
      return `${hours}小時`;
    } else {
      return `${hours}小時`;
    }
  }
  return `${minutes}分鐘`;
}

// ========== 服務時長 ==========

/**
 * 從 Sheet 或預設值取得服務時長
 */
function getDuration(service) {
  // 先嘗試從 Sheet 讀取
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_SERVICES);
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const keyword = data[i][0];
        const duration = data[i][1];
        if (keyword && service.includes(keyword)) {
          return parseInt(duration);
        }
      }
    }
  } catch (e) {
    console.log('讀取服務表失敗，使用預設值');
  }

  // 使用預設對照表
  for (const [keyword, minutes] of Object.entries(DEFAULT_SERVICE_DURATION)) {
    if (service.includes(keyword)) {
      return minutes;
    }
  }

  return 60; // 預設 1 小時
}

// ========== Sheet 操作 ==========

/**
 * 新增預約
 */
function addBooking(date, startTime, endTime, name, phone, service, duration, occupiedSlots) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_BOOKINGS);

  sheet.appendRow([
    date,
    startTime,
    endTime,
    name,
    phone,
    service,
    duration,
    occupiedSlots,
    new Date() // 建立時間
  ]);
}

/**
 * 刪除預約
 */
function deleteBooking(date, startTime) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_BOOKINGS);
  const data = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === date && data[i][1] === startTime) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

/**
 * 檢查時段衝突
 */
function checkConflicts(date, newSlots) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_BOOKINGS);
  const data = sheet.getDataRange().getValues();

  const existingSlots = new Set();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === date) {
      const slots = data[i][7].split(',');
      slots.forEach(s => existingSlots.add(s.trim()));
    }
  }

  return newSlots.filter(slot => existingSlots.has(slot));
}

/**
 * 取得指定日期的已預約時段（給網頁用）
 */
function getBookingsByDate(date) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_BOOKINGS);
    const data = sheet.getDataRange().getValues();

    const allSlots = [];

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === date) {
        const slots = data[i][7].split(',');
        slots.forEach(s => {
          const trimmed = s.trim();
          if (trimmed) allSlots.push(trimmed);
        });
      }
    }

    // 去重複並排序
    const uniqueSlots = [...new Set(allSlots)].sort();

    return { bookedTimes: uniqueSlots };
  } catch (e) {
    console.error('getBookingsByDate error:', e);
    return { bookedTimes: [], error: e.message };
  }
}

/**
 * 取得指定日期的預約詳情（給查詢用）
 */
function getBookingsForDisplay(date) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_BOOKINGS);
  const data = sheet.getDataRange().getValues();

  const bookings = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === date) {
      bookings.push({
        time: data[i][1],
        endTime: data[i][2],
        name: data[i][3],
        phone: data[i][4],
        service: data[i][5]
      });
    }
  }

  // 按時間排序
  bookings.sort((a, b) => a.time.localeCompare(b.time));

  return bookings;
}

/**
 * 取得店家設定
 */
function getSettings() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_SETTINGS);
    const data = sheet.getDataRange().getValues();

    const settings = {};
    for (let i = 1; i < data.length; i++) {
      const key = data[i][0];
      const value = data[i][1];
      if (key) {
        settings[key] = value;
      }
    }

    return settings;
  } catch (e) {
    console.error('getSettings error:', e);
    return {};
  }
}

// ========== LINE 回覆 ==========

/**
 * 回覆 LINE 訊息
 */
function replyMessage(replyToken, text) {
  const url = 'https://api.line.me/v2/bot/message/reply';

  const payload = {
    replyToken: replyToken,
    messages: [{
      type: 'text',
      text: text
    }]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    payload: JSON.stringify(payload)
  };

  try {
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    console.error('replyMessage error:', e);
  }
}

// ========== 初始化 ==========

/**
 * 初始化 Sheet 結構（手動執行一次）
 */
function initializeSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Bookings Sheet
  let bookingsSheet = ss.getSheetByName(SHEET_BOOKINGS);
  if (!bookingsSheet) {
    bookingsSheet = ss.insertSheet(SHEET_BOOKINGS);
    bookingsSheet.appendRow(['日期', '開始時間', '結束時間', '姓名', '電話', '服務', '時長(分)', '佔用時段', '建立時間']);
    bookingsSheet.setFrozenRows(1);
  }

  // Services Sheet
  let servicesSheet = ss.getSheetByName(SHEET_SERVICES);
  if (!servicesSheet) {
    servicesSheet = ss.insertSheet(SHEET_SERVICES);
    servicesSheet.appendRow(['關鍵字', '時長(分鐘)']);
    servicesSheet.appendRow(['剪', 20]);
    servicesSheet.appendRow(['剪髮', 20]);
    servicesSheet.appendRow(['洗剪', 30]);
    servicesSheet.appendRow(['補染', 90]);
    servicesSheet.appendRow(['全染', 120]);
    servicesSheet.appendRow(['染髮', 120]);
    servicesSheet.appendRow(['燙', 150]);
    servicesSheet.appendRow(['燙髮', 150]);
    servicesSheet.appendRow(['染燙', 210]);
    servicesSheet.appendRow(['護髮', 60]);
    servicesSheet.setFrozenRows(1);
  }

  // Settings Sheet
  let settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_SETTINGS);
    settingsSheet.appendRow(['項目', '值']);
    settingsSheet.appendRow(['shop_name', 'XX美髮工作室']);
    settingsSheet.appendRow(['contact_phone', '0912-345-678']);
    settingsSheet.appendRow(['contact_line', '@xxx']);
    settingsSheet.appendRow(['slot_interval', 30]);
    settingsSheet.setFrozenRows(1);
  }

  console.log('Sheets 初始化完成！');
}

/**
 * 測試用 - 模擬預約訊息
 */
function testBooking() {
  const testMessage = '預約 2/1 10:00 王小姐 0912345678 全染';
  console.log('測試訊息:', testMessage);

  const parts = testMessage.split(/\s+/);
  const dateStr = parts[1];
  const time = parts[2];
  const name = parts[3];
  const phone = parts[4];
  const service = parts[5];

  const date = parseDate(dateStr);
  const duration = getDuration(service);
  const endTime = calculateEndTime(time, duration);
  const slots = getOccupiedSlots(time, duration);

  console.log('日期:', date);
  console.log('時間:', time, '~', endTime);
  console.log('姓名:', name);
  console.log('電話:', phone);
  console.log('服務:', service);
  console.log('時長:', duration, '分鐘');
  console.log('佔用時段:', slots);
}
