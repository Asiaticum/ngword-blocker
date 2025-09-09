// options.js - NGワードブロッカー設定ページ

let currentState = null;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setupEventListeners();
  // 30秒ごとに一時解除状態をチェック
  setInterval(updateBypassStatus, 30000);
});

// 状態をbackground.jsから読み込み
async function loadState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
      if (chrome.runtime.lastError) {
        console.error('状態の読み込みに失敗:', chrome.runtime.lastError);
        return;
      }
      currentState = state;
      updateUI();
      resolve();
    });
  });
}

// 状態をbackground.jsに保存
function saveState(partialState) {
  chrome.runtime.sendMessage(
    { type: 'SET_STATE', payload: partialState },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('状態の保存に失敗:', chrome.runtime.lastError);
        return;
      }
      // DNRルールを再構築
      chrome.runtime.sendMessage({ type: 'REBUILD_DNR' });
      loadState(); // UI更新のために状態を再読み込み
    }
  );
}

// UIの更新
function updateUI() {
  if (!currentState) return;
  
  updateNgWordList();
  updateNgWordTextarea();
  updateSettings();
  updateBypassStatus();
}

// NGワードリストの更新
function updateNgWordList() {
  const listElement = document.getElementById('ng-word-list');
  listElement.innerHTML = '';
  
  if (!currentState.ngWords || currentState.ngWords.length === 0) {
    return;
  }
  
  currentState.ngWords.forEach(word => {
    const li = document.createElement('li');
    
    const span = document.createElement('span');
    span.textContent = word;
    li.appendChild(span);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '削除';
    deleteBtn.className = 'delete-btn';
    deleteBtn.onclick = () => deleteWord(word);
    li.appendChild(deleteBtn);
    
    listElement.appendChild(li);
  });
}

// テキストエリアの更新
function updateNgWordTextarea() {
  const textarea = document.getElementById('ng-word-textarea');
  if (currentState.ngWords && currentState.ngWords.length > 0) {
    textarea.value = currentState.ngWords.join('\n');
  } else {
    textarea.value = '';
  }
}

// 設定項目の更新
function updateSettings() {
  const regexMode = document.getElementById('regex-mode');
  const wordBoundary = document.getElementById('word-boundary');
  const showBadge = document.getElementById('show-badge');
  
  if (currentState.settings) {
    regexMode.checked = currentState.settings.useRegex || false;
    wordBoundary.checked = currentState.settings.useWordBoundaryEN || false;
    showBadge.checked = currentState.settings.showBadge !== false; // デフォルト true
  }
}

// 一時解除状態の更新
function updateBypassStatus() {
  const statusElement = document.getElementById('disable-status-text');
  
  if (currentState.tempBypassUntil && Date.now() < currentState.tempBypassUntil) {
    const remaining = Math.ceil((currentState.tempBypassUntil - Date.now()) / (1000 * 60));
    statusElement.textContent = `無効（残り約${remaining}分）`;
    statusElement.style.color = '#ea4335';
  } else {
    statusElement.textContent = '有効';
    statusElement.style.color = '#137333';
  }
}

// イベントリスナーの設定
function setupEventListeners() {
  // NGワード保存ボタン
  document.getElementById('save-ng-words-btn').onclick = saveNgWords;
  
  // 設定変更
  document.getElementById('regex-mode').onchange = saveSettings;
  document.getElementById('word-boundary').onchange = saveSettings;
  document.getElementById('show-badge').onchange = saveSettings;
  
  // 一時解除ボタン
  document.getElementById('temp-disable-btn').onclick = tempDisable;
  
  // JSON操作
  document.getElementById('export-json-btn').onclick = exportJson;
  document.getElementById('import-json-btn').onclick = () => {
    document.getElementById('json-import-file').click();
  };
  document.getElementById('json-import-file').onchange = importJson;
}

// NGワード保存
function saveNgWords() {
  const textarea = document.getElementById('ng-word-textarea');
  const text = textarea.value;
  
  if (!text.trim()) {
    saveState({ ngWords: [] });
    return;
  }
  
  // 行ごとに分割して正規化
  const words = text.split('\n')
    .map(line => {
      // normalize.jsの関数を使用
      if (typeof window.normalizeText === 'function') {
        return window.normalizeText(line);
      } else {
        // フォールバック: 基本的な正規化
        return line.trim().toLowerCase();
      }
    })
    .filter(word => word.length > 0)
    .filter((word, index, arr) => arr.indexOf(word) === index); // 重複除去
  
  saveState({ ngWords: words });
  
  alert(`${words.length}個のNGワードを保存しました`);
}

// NGワード削除
function deleteWord(wordToDelete) {
  if (!confirm(`「${wordToDelete}」を削除しますか？`)) {
    return;
  }
  
  const newWords = currentState.ngWords.filter(word => word !== wordToDelete);
  saveState({ ngWords: newWords });
}

// 設定保存
function saveSettings() {
  const settings = {
    useRegex: document.getElementById('regex-mode').checked,
    useWordBoundaryEN: document.getElementById('word-boundary').checked,
    showBadge: document.getElementById('show-badge').checked
  };
  
  saveState({ settings: settings });
}

// 一時解除
function tempDisable() {
  const selectedRadio = document.querySelector('input[name="disable-duration"]:checked');
  
  if (!selectedRadio) {
    alert('時間を選択してください');
    return;
  }
  
  const minutes = parseInt(selectedRadio.value);
  const now = Date.now();
  const until = now + (minutes * 60 * 1000);
  
  saveState({ tempBypassUntil: until });
  
  alert(`${minutes}分間、NGワードブロック機能を無効にしました`);
}

// JSON エクスポート
function exportJson() {
  if (!currentState) {
    alert('設定データが読み込まれていません');
    return;
  }
  
  const exportData = {
    ngWords: currentState.ngWords || [],
    settings: currentState.settings || {}
  };
  
  const dataStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `ngword-blocker-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// JSON インポート
function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importedData = JSON.parse(e.target.result);
      
      if (!confirm('現在の設定を上書きしてインポートしますか？\n※この操作は元に戻せません')) {
        return;
      }
      
      const newState = {};
      
      // NGワードのインポート
      if (Array.isArray(importedData.ngWords)) {
        newState.ngWords = importedData.ngWords
          .map(word => String(word).trim())
          .filter(word => word.length > 0)
          .filter((word, index, arr) => arr.indexOf(word) === index); // 重複除去
      }
      
      // 設定のインポート
      if (typeof importedData.settings === 'object' && importedData.settings !== null) {
        newState.settings = {
          useRegex: Boolean(importedData.settings.useRegex),
          useWordBoundaryEN: Boolean(importedData.settings.useWordBoundaryEN),
          showBadge: importedData.settings.showBadge !== false // デフォルト true
        };
      }
      
      saveState(newState);
      alert('設定をインポートしました');
      
    } catch (error) {
      console.error('Import error:', error);
      alert('JSONファイルの読み込みに失敗しました。ファイル形式を確認してください。');
    } finally {
      // ファイル入力をリセット
      event.target.value = '';
    }
  };
  
  reader.readAsText(file);
}