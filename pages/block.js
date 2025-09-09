// block.js - ブロックページの処理

document.addEventListener('DOMContentLoaded', () => {
  // URLパラメータの取得
  const params = new URLSearchParams(window.location.search);
  
  const query = decodeURIComponent(params.get('query') || '');
  const ngword = decodeURIComponent(params.get('ngword') || '');
  const engine = decodeURIComponent(params.get('engine') || '');
  
  // 表示内容の設定
  displayBlockInfo(query, ngword, engine);
  
  // イベントリスナーの設定
  setupEventListeners();
});

// ブロック情報の表示
function displayBlockInfo(query, ngword, engine) {
  // 各要素に値を設定
  setText('ngword', `「${ngword}」`);
  setText('engine', formatEngineName(engine));
}


// 検索エンジン名の整形
function formatEngineName(engine) {
  if (!engine || engine === 'unknown') {
    return '不明';
  }
  
  const engineMap = {
    'google.com': 'Google',
    'www.google.com': 'Google',
    'bing.com': 'Bing',
    'www.bing.com': 'Bing',
    'duckduckgo.com': 'DuckDuckGo',
    'search.yahoo.co.jp': 'Yahoo! JAPAN'
  };
  
  // ホスト名から検索エンジン名を推定
  for (const [host, name] of Object.entries(engineMap)) {
    if (engine.includes(host)) {
      return name;
    }
  }
  
  return engine;
}

// テキストの安全な設定
function setText(elementId, text) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text || '不明';
  }
}

// イベントリスナーの設定
function setupEventListeners() {
  // NGワード設定編集ボタン
  const editSettingsButton = document.getElementById('edit-settings');
  if (editSettingsButton) {
    editSettingsButton.addEventListener('click', openOptionsPage);
  }
  
}

// オプションページを開く
function openOptionsPage() {
  try {
    if (chrome && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      console.error('chrome.runtime.openOptionsPage is not available');
      alert('設定ページを開くことができませんでした。');
    }
  } catch (error) {
    console.error('Error opening options page:', error);
    alert('設定ページを開くことができませんでした。');
  }
}


// ページを閉じる（オプション）
function closePage() {
  try {
    window.close();
  } catch (error) {
    console.log('自動でページを閉じることができませんでした');
  }
}