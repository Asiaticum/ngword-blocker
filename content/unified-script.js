// content/unified-script.js - 統合NGワードブロックスクリプト

(function() {
  'use strict';

  // === 状態管理 ===
  let currentNgWords = [];
  let currentSettings = {};
  let isInitialized = false;
  let lastCheckedQuery = '';
  let monitoredElements = new WeakSet();

  // === 初期化 ===
  function initialize() {
    if (isInitialized) return;
    
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('統合スクリプト - 状態取得エラー:', chrome.runtime.lastError);
        return;
      }
      
      if (response) {
        currentNgWords = response.ngWords || [];
        currentSettings = response.settings || {};
        
        // 一時解除中かチェック
        const isBypassed = response.tempBypassUntil && Date.now() < response.tempBypassUntil;
        
        if (!isBypassed && currentNgWords.length > 0) {
          setupUnifiedMonitoring();
          checkCurrentUrl();
        }
      }
    });
    
    isInitialized = true;
  }

  // === 統合監視システム ===
  function setupUnifiedMonitoring() {
    // 1. リアルタイムフォーム監視
    setupFormMonitoring();
    
    // 2. SPA対応のHistory API監視
    setupSpaMonitoring();
    
    // 3. DOM変更監視
    setupMutationObserver();
    
    // 4. フォールバック定期チェック（間隔を延長）
    setInterval(periodicFallbackCheck, 2000);
  }

  // === フォーム監視 (injector.js統合) ===
  function setupFormMonitoring() {
    // 検索入力フィールドを特定
    const searchSelectors = [
      'input[name="q"]',      // Google, Bing, DuckDuckGo
      'textarea[name="q"]',   // Google (複数行)
      'input[name="p"]',      // Yahoo! JAPAN
      'input[type="search"]', // 汎用
      '.gLFyf',              // Google現在の検索ボックス
      '#sb_form_q',          // Bing検索ボックス
      '.js-search-input'     // DuckDuckGo検索ボックス
    ];

    searchSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (!monitoredElements.has(element)) {
          setupElementMonitoring(element);
          monitoredElements.add(element);
        }
      });
    });

    // フォーム全体の監視
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      if (!monitoredElements.has(form)) {
        form.addEventListener('submit', handleFormSubmit, true);
        monitoredElements.add(form);
      }
    });
  }

  // 個別要素の監視設定
  function setupElementMonitoring(element) {
    // キーダウンイベント（Enterキー）
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        const query = event.target.value.trim();
        if (query && query !== lastCheckedQuery) {
          const matchedWord = checkForNgWords(query);
          if (matchedWord) {
            event.preventDefault();
            event.stopImmediatePropagation();
            blockAndRedirect(query, matchedWord, window.location.hostname);
          }
        }
      }
    }, true);
  }

  // フォーム送信処理
  function handleFormSubmit(event) {
    const form = event.target;
    const formData = new FormData(form);
    
    // 検索クエリを取得
    let query = formData.get('q') || formData.get('p') || formData.get('text') || '';
    
    // 入力フィールドからも取得を試行
    if (!query) {
      const inputs = form.querySelectorAll('input[type="text"], input[type="search"], textarea');
      for (const input of inputs) {
        if (input.value && input.value.trim()) {
          query = input.value.trim();
          break;
        }
      }
    }

    if (query && query !== lastCheckedQuery) {
      const matchedWord = checkForNgWords(query);
      if (matchedWord) {
        event.preventDefault();
        event.stopImmediatePropagation();
        blockAndRedirect(query, matchedWord, window.location.hostname);
      }
    }
  }

  // === SPA監視 (spa-hooks.js統合) ===
  function setupSpaMonitoring() {
    // History APIのフック
    hookHistoryAPI();
    
    // popstateイベントの監視
    window.addEventListener('popstate', handleUrlChange);
  }

  // History APIのフック
  function hookHistoryAPI() {
    // pushStateのフック
    const originalPushState = history.pushState;
    history.pushState = function() {
      const result = originalPushState.apply(this, arguments);
      setTimeout(() => handleUrlChange(), 10);
      return result;
    };

    // replaceStateのフック
    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
      const result = originalReplaceState.apply(this, arguments);
      setTimeout(() => handleUrlChange(), 10);
      return result;
    };
  }

  // URL変更ハンドラ
  function handleUrlChange() {
    checkCurrentUrl();
    // 新しいページでフォーム監視を再設定
    setTimeout(setupFormMonitoring, 100);
  }

  // === DOM変更監視 ===
  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      let needsSetup = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 検索フォームが追加された可能性
              if (node.matches && 
                  (node.matches('form') || 
                   node.matches('input[name="q"]') || 
                   node.matches('input[name="p"]'))) {
                needsSetup = true;
              }
              // 子要素にも検索フォームがある可能性
              if (node.querySelector && 
                  node.querySelector('form, input[name="q"], input[name="p"]')) {
                needsSetup = true;
              }
            }
          });
        }
      });

      if (needsSetup) {
        setTimeout(setupFormMonitoring, 100);
      }
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  // === フォールバック定期チェック ===
  function periodicFallbackCheck() {
    // URL変更チェック（History APIで捉えられない変更用）
    checkCurrentUrl();
    
    // アクティブな検索フィールドチェック（SPA用フォールバック）
    const activeElement = document.activeElement;
    if (activeElement && 
        (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      
      const isSearchField = activeElement.name === 'q' || 
                           activeElement.name === 'p' || 
                           activeElement.type === 'search' ||
                           activeElement.classList.contains('gLFyf') ||
                           activeElement.id === 'sb_form_q';
      
      if (isSearchField && activeElement.value && activeElement.value.trim()) {
        const query = activeElement.value.trim();
        if (query !== lastCheckedQuery) {
          const matchedWord = checkForNgWords(query);
          if (matchedWord) {
            // 即座にブロック（入力クリアはblockAndRedirect内で処理）
            blockAndRedirect(query, matchedWord, window.location.hostname);
          }
        }
      }
    }
  }

  // === 現在のURLチェック ===
  function checkCurrentUrl() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q') || params.get('p') || params.get('text') || '';
    
    // 前回と同じクエリの場合はスキップ
    if (query === lastCheckedQuery || !query.trim()) {
      return;
    }
    
    lastCheckedQuery = query;
    
    const matchedWord = checkForNgWords(query);
    if (matchedWord) {
      blockAndRedirect(query, matchedWord, window.location.hostname);
    }
  }

  // === 統一NGワードチェック ===
  function checkForNgWords(query) {
    if (!query || !currentNgWords.length) return null;

    // 検索クエリの正規化
    let normalizedQuery;
    if (typeof window.normalizeText === 'function') {
      normalizedQuery = window.normalizeText(query);
    } else {
      // フォールバック正規化
      normalizedQuery = query.toLowerCase().trim();
    }

    // NGワードとマッチング
    for (const ngWord of currentNgWords) {
      if (currentSettings.useRegex) {
        // 正規表現モード: NGワードは正規化しない
        try {
          let pattern = ngWord;
          if (currentSettings.useWordBoundaryEN && /[a-zA-Z0-9]/.test(ngWord)) {
            pattern = `\\b${pattern}\\b`;
          }
          const regex = new RegExp(pattern, 'i');
          if (regex.test(normalizedQuery)) {
            return ngWord;
          }
        } catch (e) {
          // 正規表現エラーの場合は部分一致で処理（正規化あり）
          let normalizedNgWord;
          if (typeof window.normalizeText === 'function') {
            normalizedNgWord = window.normalizeText(ngWord);
          } else {
            normalizedNgWord = ngWord.toLowerCase().trim();
          }
          if (normalizedQuery.includes(normalizedNgWord)) {
            return ngWord;
          }
        }
      } else {
        // 部分一致モード: NGワードも正規化
        let normalizedNgWord;
        if (typeof window.normalizeText === 'function') {
          normalizedNgWord = window.normalizeText(ngWord);
        } else {
          normalizedNgWord = ngWord.toLowerCase().trim();
        }
        if (normalizedQuery.includes(normalizedNgWord)) {
          return ngWord;
        }
      }
    }

    return null;
  }

  // === 統一ブロック処理 ===
  function blockAndRedirect(query, matchedWord, engine) {
    // 重複防止のため、最後にチェックしたクエリを更新
    lastCheckedQuery = query;
    
    // ブロック数をカウントアップ
    chrome.runtime.sendMessage({ type: 'INCREMENT_BLOCKED' });

    // アクティブな入力フィールドがあればクリア
    const activeElement = document.activeElement;
    if (activeElement && 
        (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      activeElement.value = '';
    }

    // Background Scriptにリダイレクトを依頼
    chrome.runtime.sendMessage({
      type: 'BLOCK_AND_REDIRECT',
      payload: {
        query: query,
        matchedWord: matchedWord,
        engine: engine || 'unknown'
      }
    });
  }

  // === 初期化実行 ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // ページ読み込み完了後に追加設定
  window.addEventListener('load', () => {
    if (isInitialized) {
      setupFormMonitoring();
    }
  });

})();