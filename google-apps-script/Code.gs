/**
 * 一人美髮工作室預約系統 - Google Apps Script
 * 功能：LINE Webhook + Sheet API
 */

// ========== 設定區 ==========
const LINE_CHANNEL_ACCESS_TOKEN = 'klEHU35By6nlmQszUOFe39ycvj1rjVOAq1II4A2OMg+fdRXkgCRlX+q8u/dhaQE72PXnzPBaiYJr8YQg6SlleXFf+iQA1Spj8pHczA1tksvkNb7KGFX6CGyHB9iMxnD/hrN1rRPkXQ2NSrXAyUKXQAdB04t89/1O/w1cDnyilFU=';
const SPREADSHEET_ID = '1kk6E2DASxKcH-Cs2rllX3HcCFolkRuH1dfvPjWFY1PE';

// Sheet 名稱
const SHEET_BOOKINGS = 'Bookings';
const SHEET_SERVICES = 'Services';
const SHEET_SETTINGS = 'Settings';

// 服務時長對照表（分鐘）- 備用
const DEFAULT_SERVICE_DURATION = {
  '染燙': 210,
  '燙髮': 150,
  '燙': 150,
  '全染': 120,
  '染髮': 120,
  '補染': 90,
  '護髮': 60,
  '洗剪': 30,
  '剪髮': 20,
  '剪': 20
};

// ========== HTTP GET 處理 ==========
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
      result = { status: 'ok', message: 'Bot is working!' };
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========== HTTP POST 處理 (LINE Webhook) ==========
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    if (!data.events || data.events.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({status: 'no events'}));
    }
    
    const event = data.events[0];
    
    // 只處理文字訊息
    if (event.type !== 'message' || event.message.type !== 'text') {
      return ContentService.createTextOutput(JSON.stringify({status: 'ignored'}));
    }
    
    const userMessage = event.message.text.trim();
    const replyToken = event.replyToken;
    
    // 根據訊息內容分流處理
    if (userMessage.startsWith('預約')) {
      handleBooking(userMessage, replyToken);
    } else if (userMessage.startsWith('查詢')) {
      handleQuery(userMessage, replyToken);
    } else if (userMessage.startsWith('取消')) {
      handleCancel(userMessage, replyToken);
    } else {
      // 不認識的指令，提供說明
      replyMessage(replyToken, 
        '📋 使用說明：\n\n' +
        '• 預約 2/1 10:00 王小姐 0912345678 剪髮\n' +
        '• 查詢 2/1\n' +
        '• 取消 2/1 10:00'
      );
    }
    
    return ContentService.createTextOutput(JSON.stringify({status: 'success'}));
    
  } catch (error) {
    Logger.log('doPost error: ' + error);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    }));
  }
}

// ========== 處理預約 ==========
function handleBooking(message, replyToken) {
  try {
    const rawMsg = message.trim();
    
    // 1. 抓取時間
    const timeMatch = rawMsg.match(/(\d{1,2})[:：](\d{2})/);
    if (!timeMatch) {
      replyMessage(replyToken, '❌ 找不到時間\n請使用格式：預約 2/1 10:00 王小姐 0912345678 剪髮');
      return;
    }
    const startTime = timeMatch[1].padStart(2, '0') + ':' + timeMatch[2];
    
    // 2. 抓取日期
    const dateMatch = rawMsg.match(/(\d{1,2})[\/\-月](\d{1,2})/);
    if (!dateMatch) {
      replyMessage(replyToken, '❌ 找不到日期\n請使用格式：預約 2/1 10:00 王小姐 0912345678 剪髮');
      return;
    }
    const dateStr = dateMatch[0];
    const date = parseDate(dateStr);
    
    // 3. 抓取姓名和電話
    const parts = rawMsg.split(/\s+/);
    const name = parts[3] || '客人';
    const phone = parts[4] || '';
    
    // 4. 抓取服務並計算時長
    const durationInfo = getDurationInfo(rawMsg);
    const service = durationInfo.name;
    const duration = durationInfo.time;
    
    // 5. 計算結束時間和佔用時段
    const endTime = calculateEndTime(startTime, duration);
    const occupiedSlots = getOccupiedSlots(startTime, duration);
    
    // 6. 檢查衝突
    if (checkConflicts(date, startTime, endTime)) {
      replyMessage(replyToken, 
        `⚠️ 時段衝突\n\n${startTime} ~ ${endTime} 已有預約`
      );
      return;
    }
    
    // 7. 寫入 Sheet
    addBooking(date, startTime, endTime, name, phone, service, duration, occupiedSlots.join(','));
    
    // 8. 回覆確認
    const formattedDate = formatDateDisplay(date);
    replyMessage(replyToken, 
      `✅ 預約成功！\n\n` +
      `📅 ${formattedDate}\n` +
      `⏰ ${startTime} ~ ${endTime}\n` +
      `👤 ${name}\n` +
      `💇 ${service}（${duration}分鐘）`
    );
    
  } catch (error) {
    Logger.log('handleBooking error: ' + error);
    replyMessage(replyToken, '❌ 預約失敗：' + error.message);
  }
}

// ========== 處理取消 ==========
/**
 * 處理取消訊息 - 修正版（支援無空格格式）
 */
/**
 * 處理取消訊息 - 嚴格驗證版（防呆設計）
 */
function handleCancel(message, replyToken) {
  try {
    // 提取日期和時間
    const dateMatch = message.match(/(\d{1,2})[\/\-月](\d{1,2})/);
    const timeMatch = message.match(/(\d{1,2})[:：](\d{2})/);
    
    // 🔥 防呆1：檢查格式
    if (!dateMatch || !timeMatch) {
      replyMessage(replyToken, 
        '❌ 格式不完整\n\n' +
        '正確格式：\n' +
        '• 取消 2/1 10:00\n' +
        '• 取消2/1 10:00\n\n' +
        '請提供日期和時間'
      );
      return;
    }
    
    const dateStr = dateMatch[0]; // 例如：2/1
    const time = timeMatch[1].padStart(2, '0') + ':' + timeMatch[2]; // 例如：10:00
    
    const date = parseDate(dateStr);
    
    // 🔥 防呆2：檢查日期是否有效
    if (!date) {
      replyMessage(replyToken, 
        '❌ 日期格式錯誤\n\n' +
        '您輸入的日期：' + dateStr + '\n\n' +
        '請使用正確格式，例如：2/1'
      );
      return;
    }
    
    const deleted = deleteBooking(date, time);
    
    if (deleted) {
      const formattedDate = formatDateDisplay(date);
      replyMessage(replyToken, `✅ 已取消\n${formattedDate} ${time} 的預約`);
    } else {
      const formattedDate = formatDateDisplay(date);
      replyMessage(replyToken, 
        `❌ 找不到預約\n\n` +
        `日期：${formattedDate}\n` +
        `時間：${time}\n\n` +
        `請確認預約資訊是否正確`
      );
    }
    
  } catch (error) {
    Logger.log('handleCancel error: ' + error);
    replyMessage(replyToken, '❌ 取消失敗，請稍後再試');
  }
}
// ========== 處理查詢 ==========
/**
 * 處理查詢訊息 - 修正版（支援無空格格式）
 */
/**
 * 處理查詢訊息 - 嚴格驗證版（防呆設計）
 */
function handleQuery(message, replyToken) {
  try {
    let dateStr = null;
    let isExplicitDate = false; // 標記用戶是否明確提供日期
    
    // 方法1：嘗試用空格分割（標準格式：查詢 2/1）
    const parts = message.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1]) {
      dateStr = parts[1];
      isExplicitDate = true;
    } else {
      // 方法2：沒有空格，用正則提取日期（查詢2/1）
      const dateMatch = message.match(/查詢(\d{1,2})[\/\-月](\d{1,2})/);
      if (dateMatch) {
        dateStr = dateMatch[1] + '/' + dateMatch[2]; // 重組為 2/1 格式
        isExplicitDate = true;
      }
    }
    
    // 🔥 關鍵防呆：如果用戶提供了日期但解析失敗，要明確告知
    if (isExplicitDate) {
      const date = parseDate(dateStr);
      
      if (!date) {
        replyMessage(replyToken, 
          '❌ 日期格式錯誤\n\n' +
          '請使用以下格式：\n' +
          '• 查詢 2/1\n' +
          '• 查詢2/1\n' +
          '• 查詢 2月1日\n\n' +
          '或直接輸入「查詢」查看今天'
        );
        return;
      }
      
      // 日期解析成功，繼續查詢
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
      
    } else {
      // 用戶只輸入「查詢」，沒有指定日期 → 查看今天
      const today = getTodayString();
      const bookings = getBookingsForDisplay(today);
      const formattedDate = formatDateDisplay(today);
      
      if (bookings.length === 0) {
        replyMessage(replyToken, `📅 今天 ${formattedDate}\n\n目前無預約`);
      } else {
        const list = bookings.map(b => 
          `${b.time} ~ ${b.endTime}\n${b.name} ${b.service}`
        ).join('\n\n');
        
        replyMessage(replyToken, `📅 今天 ${formattedDate}\n\n${list}`);
      }
    }
    
  } catch (error) {
    Logger.log('handleQuery error: ' + error);
    replyMessage(replyToken, '❌ 查詢失敗，請稍後再試');
  }
}
// ========== 工具函數 ==========

// 取得服務時長資訊
function getDurationInfo(text) {
  const table = [
    { key: '染燙', time: 210 },
    { key: '燙髮', time: 150 },
    { key: '燙', time: 150 },
    { key: '全染', time: 120 },
    { key: '染髮', time: 120 },
    { key: '補染', time: 90 },
    { key: '護髮', time: 60 },
    { key: '洗剪', time: 30 },
    { key: '剪髮', time: 20 },
    { key: '剪', time: 20 }
  ];
  
  for (let item of table) {
    if (text.includes(item.key)) {
      return { name: item.key, time: item.time };
    }
  }
  
  return { name: '剪髮', time: 20 };
}

// 解析日期
function parseDate(dateStr) {
  const today = new Date();
  let year = today.getFullYear();
  let month, day;
  
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    month = parseInt(parts[0]);
    day = parseInt(parts[1]);
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      year = parseInt(parts[0]);
      month = parseInt(parts[1]);
      day = parseInt(parts[2]);
    }
  } else {
    return null;
  }
  
  if (!month || !day) return null;
  
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 格式化日期顯示
function formatDateDisplay(dateStr) {
  const parts = dateStr.split('-');
  const month = parseInt(parts[1]);
  const day = parseInt(parts[2]);
  const date = new Date(parseInt(parts[0]), month - 1, day);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${month}月${day}日（${weekdays[date.getDay()]}）`;
}

// 取得今天日期
function getTodayString() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

// 計算結束時間
function calculateEndTime(startTime, durationMinutes) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}

// 產生佔用時段
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

// ========== Sheet 操作 ==========

/**
 * 新增預約 - 修正版（強制時間為字串格式）
 */
function addBooking(date, startTime, endTime, name, phone, service, duration, occupiedSlots) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_BOOKINGS);

  // 關鍵：在時間和佔用時段前加上單引號，強制 Google Sheets 將其視為文字
  sheet.appendRow([
    date,
    "'" + startTime,       // ← 強制文字
    "'" + endTime,         // ← 強制文字
    name,
    phone,
    service,
    duration,
    "'" + occupiedSlots,   // ← 強制文字（修正關鍵！）
    new Date()
  ]);
}

// 刪除預約
function deleteBooking(date, startTime) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_BOOKINGS);
  const data = sheet.getDataRange().getValues();
  
  for (let i = data.length - 1; i >= 1; i--) {
    const rowDate = Utilities.formatDate(new Date(data[i][0]), 'GMT+8', 'yyyy-MM-dd');
    const rowTime = formatToHM(data[i][1]);
    
    if (rowDate === date && rowTime === startTime) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  
  return false;
}

/**
 * 檢查時段衝突 - 總分鐘數比對法
 */
function checkConflicts(date, startTime, endTime) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_BOOKINGS);
  const data = sheet.getDataRange().getValues();

  // 1. 將新預約轉為總分鐘數 (例如 "14:00" -> 840)
  const newStartTotal = timeToMinutes(startTime);
  const newEndTotal = timeToMinutes(endTime);
  
  console.log(`新預約比對中: ${date} ${newStartTotal}分 ~ ${newEndTotal}分`);

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0] || !data[i][1] || !data[i][2]) continue;

    // 2. 格式化 Sheet 中的日期
    let sheetDate = "";
    try {
      sheetDate = Utilities.formatDate(new Date(data[i][0]), "GMT+8", "yyyy-MM-dd");
    } catch (e) { continue; }

    // 3. 如果日期相同，則比對時間
    if (sheetDate === date) {
      let existStartTotal = timeToMinutes(formatToHM(data[i][1]));
      let existEndTotal = timeToMinutes(formatToHM(data[i][2]));

      // 4. 衝突邏輯：(新開始 < 舊結束) 且 (新結束 > 舊開始)
      if (newStartTotal < existEndTotal && newEndTotal > existStartTotal) {
        console.log("⚠️ 偵測到衝突！");
        return true; 
      }
    }
  }
  return false; 
}
/**
 * 緊急除錯測試
 */
function debugConflictTest() {
  Logger.clear();
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_BOOKINGS);
  const data = sheet.getDataRange().getValues();
  
  Logger.log('========== Sheet 中的所有資料 ==========');
  
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      Logger.log('標題列: ' + JSON.stringify(data[i]));
      continue;
    }
    
    if (!data[i][0]) {
      Logger.log('第 ' + i + ' 行: 空行');
      continue;
    }
    
    Logger.log('\n第 ' + i + ' 行:');
    Logger.log('  A欄(日期) 原始值: ' + data[i][0]);
    Logger.log('  A欄(日期) 類型: ' + typeof data[i][0]);
    Logger.log('  A欄(日期) 是Date?: ' + (data[i][0] instanceof Date));
    
    Logger.log('  B欄(開始) 原始值: ' + data[i][1]);
    Logger.log('  B欄(開始) 類型: ' + typeof data[i][1]);
    Logger.log('  B欄(開始) 是Date?: ' + (data[i][1] instanceof Date));
    
    Logger.log('  C欄(結束) 原始值: ' + data[i][2]);
    Logger.log('  C欄(結束) 類型: ' + typeof data[i][2]);
    
    try {
      const rowDate = Utilities.formatDate(new Date(data[i][0]), 'GMT+8', 'yyyy-MM-dd');
      Logger.log('  ✅ 日期格式化成功: ' + rowDate);
    } catch (e) {
      Logger.log('  ❌ 日期格式化失敗: ' + e);
    }
    
    try {
      const rowStart = formatToHM(data[i][1]);
      const rowEnd = formatToHM(data[i][2]);
      Logger.log('  ✅ 時間格式化成功: ' + rowStart + ' ~ ' + rowEnd);
    } catch (e) {
      Logger.log('  ❌ 時間格式化失敗: ' + e);
    }
  }
  
  Logger.log('\n========== 測試衝突檢測 ==========');
  Logger.log('測試: 2026-02-01 10:00~10:20 是否與現有預約衝突？');
  
  const hasConflict = checkConflicts('2026-02-01', '10:00', '10:20');
  Logger.log('\n結果: ' + (hasConflict ? '有衝突 ❌' : '無衝突 ✅'));
}

/**
 * 輔助函式：時間字串轉總分鐘數
 */
function timeToMinutes(timeStr) {
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// 取得指定日期預約（給網頁用）
function getBookingsByDate(date) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_BOOKINGS);
    const data = sheet.getDataRange().getValues();

    const allSlots = [];

    Logger.log('查詢日期: ' + date);

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;

      // 使用統一的日期格式化函數
      const rowDate = formatDateToISO(data[i][0]);

      if (rowDate === date && data[i][7]) {
        // 處理佔用時段（可能是字串或 Date 物件）
        const rawSlots = data[i][7];
        let slotsStr = '';

        // 如果是 Date 物件，轉換為 HH:mm 格式
        if (rawSlots && typeof rawSlots === 'object' && rawSlots.getTime) {
          slotsStr = Utilities.formatDate(rawSlots, 'GMT+8', 'HH:mm');
        } else {
          slotsStr = String(rawSlots);
        }

        Logger.log('第' + i + '行: ' + slotsStr);

        const slots = slotsStr.split(',');
        slots.forEach(s => {
          const trimmed = s.trim();
          // 只接受 HH:mm 格式的時段
          if (trimmed && /^\d{1,2}:\d{2}$/.test(trimmed)) {
            // 統一格式為 HH:mm
            const parts = trimmed.split(':');
            const formatted = parts[0].padStart(2, '0') + ':' + parts[1];
            allSlots.push(formatted);
          }
        });
      }
    }

    const uniqueSlots = [...new Set(allSlots)].sort();
    Logger.log('回傳時段: ' + JSON.stringify(uniqueSlots));
    return { bookedTimes: uniqueSlots };

  } catch (error) {
    Logger.log('getBookingsByDate error: ' + error);
    return { bookedTimes: [], error: error.message };
  }
}

// 取得預約（給查詢用）
function getBookingsForDisplay(date) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_BOOKINGS);
  const data = sheet.getDataRange().getValues();
  
  const bookings = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowDate = formatDateToISO(row[0]);
    
    if (rowDate === date) {
      bookings.push({
        time: formatToHM(row[1]),
        endTime: formatToHM(row[2]),
        name: row[3],
        service: row[5]
      });
    }
  }
  
  return bookings;
}

function formatDateToISO(dateObj) {
  if (!dateObj) return '';
  
  try {
    if (typeof dateObj === 'object' && dateObj.getTime) {
      return Utilities.formatDate(dateObj, 'GMT+8', 'yyyy-MM-dd');
    }
  } catch (e) {}
  
  const str = String(dateObj);
  if (str.includes('-') && str.length === 10) {
    return str;
  }
  
  return '';
}

// 取得設定
function getSettings() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_SETTINGS);
    const data = sheet.getDataRange().getValues();
    
    const settings = {};
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        settings[data[i][0]] = data[i][1];
      }
    }
    
    return settings;
    
  } catch (error) {
    Logger.log('getSettings error: ' + error);
    return {};
  }
}

// ========== 輔助函數 ==========

// 時間轉分鐘數
function timeToMinutes(timeStr) {
  const [hours, mins] = timeStr.split(':').map(Number);
  return hours * 60 + mins;
}

// 格式化時間
/**
 * 格式化時間為 HH:mm
 */
function formatToHM(val) {
  // 方法1：嘗試用 Utilities.formatDate（對 Date 物件最可靠）
  try {
    // 不用 instanceof，直接嘗試格式化
    if (val && typeof val === 'object' && val.getTime) {
      return Utilities.formatDate(val, 'GMT+8', 'HH:mm');
    }
  } catch (e) {
    // 如果不是 Date，會進入這裡
  }
  
  // 方法2：如果是字串
  const str = String(val).trim();
  
  // 如果字串很長（像 "Sat Dec 30 1899 10:00:00..."），提取時間部分
  if (str.length > 10 && str.includes('GMT')) {
    // 這是完整的 Date 字串，需要重新解析
    try {
      const dateObj = new Date(str);
      return Utilities.formatDate(dateObj, 'GMT+8', 'HH:mm');
    } catch (e) {
      // 解析失敗
    }
  }
  
  // 如果是簡單的時間字串 "10:00"
  if (str.includes(':')) {
    const parts = str.split(':');
    if (parts.length >= 2) {
      const hours = parts[0].trim().replace(/\D/g, ''); // 只保留數字
      const mins = parts[1].trim().replace(/\D/g, '');
      if (hours && mins) {
        return `${hours.padStart(2, '0')}:${mins.padStart(2, '0')}`;
      }
    }
  }
  
  return str;
}

// ========== LINE API ==========

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
      'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    Logger.log('LINE API response: ' + response.getContentText());
  } catch (error) {
    Logger.log('replyMessage error: ' + error);
  }
}

// ========== 日期處理函數（補充） ==========

/**
 * 解析日期字串：2/1 → 2026-02-01
 */
function parseDate(dateStr) {
  const today = new Date();
  let year = today.getFullYear();
  let month, day;
  
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    month = parseInt(parts[0]);
    day = parseInt(parts[1]);
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      year = parseInt(parts[0]);
      month = parseInt(parts[1]);
      day = parseInt(parts[2]);
    }
  } else {
    return null;
  }
  
  if (!month || !day) return null;
  
  return formatDateISO(year, month, day);
}

/**
 * 格式化為 ISO 日期：2026-02-01
 */
function formatDateISO(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 取得今天日期：2026-01-31
 */
function getTodayString() {
  const today = new Date();
  return formatDateISO(today.getFullYear(), today.getMonth() + 1, today.getDate());
}
// ========== 測試專區 ==========
function testParseDateSimple() {
  Logger.log('測試 parseDate 函數');
  
  try {
    const result = parseDate('2/1');
    Logger.log('成功！結果: ' + result);
  } catch (error) {
    Logger.log('失敗！錯誤: ' + error);
  }
}

function testHandleCancelDirect() {
  Logger.log('========== 測試取消功能 ==========');
  
  const fakeReplyToken = 'test_token_12345';
  
  try {
    Logger.log('測試: 取消 2/1 16:00');
    handleCancel('取消 2/1 16:00', fakeReplyToken);
    Logger.log('✅ 測試成功！');
  } catch (error) {
    Logger.log('❌ 錯誤: ' + error);
    Logger.log('錯誤堆疊: ' + error.stack);
  }
}