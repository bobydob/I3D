(function() {
    // 1. Автоматический парсинг ID игры и инициализация pgAds
    const PARTNER_CLID = 'p_91b93ebb-8816-448f-bde9-a6112334d6cd';
    const scriptTag = document.currentScript || document.querySelector('script[data-game-id]');
    const GAME_ID = scriptTag ? scriptTag.getAttribute('data-game-id') : 'default_id';

    window.pgAdsCallbacks = window.pgAdsCallbacks || [];
    window.pgAdsCallbacks.push(async () => {
        try {
            await window.pgAds.init();
            window.pgAds.updateTargeting({ 
                playgama_clid: PARTNER_CLID, 
                gameId: GAME_ID,
                provider: 'playgama'
            });
        } catch(e) {}
    });

    // 2. Железобетонный перехватчик console.log для видеорекламы
    const origLog = window.console.log;
    window._forceCloseRewardedAd = null;

    window.console.log = function() {
        origLog.apply(this, arguments);
        let foundComplete = false, foundError = false;

        for (let i = 0; i < arguments.length; i++) {
            if (typeof arguments[i] === 'string') {
                if (arguments[i].includes('allAdsCompleted') || arguments[i].includes('complete')) foundComplete = true;
                else if (arguments[i].includes('AdsLoader error') || arguments[i].includes('adError') || arguments[i].includes('501')) foundError = true;
            }
        }

        if (foundComplete && typeof window._forceCloseRewardedAd === 'function') {
            let closer = window._forceCloseRewardedAd;
            window._forceCloseRewardedAd = null; 
            setTimeout(() => closer(true), 500); 
        }

        if (foundError) {
            if (typeof window._forceCloseRewardedAd === 'function') {
                let closer = window._forceCloseRewardedAd;
                window._forceCloseRewardedAd = null;
                setTimeout(() => closer(false), 500); 
            }
            setTimeout(() => {
                window.focus(); let cvs = document.querySelector('canvas'); if(cvs) cvs.focus();
            }, 100);
        }
    };

    // 3. Система событий (EventBus), идентичная v2.3.1
    const events = {};
    const emit = (event, ...data) => { if (events[event]) events[event].forEach(cb => cb(...data)); };
    const on = (event, callback) => { if (!events[event]) events[event] = []; events[event].push(callback); };
    const off = (event, callback) => { 
        if (events[event]) {
            events[event] = callback ? events[event].filter(cb => cb !== callback) : [];
        }
    };
    const once = (event, callback) => {
        const wrapper = (...data) => { off(event, wrapper); callback(...data); };
        on(event, wrapper);
    };

    let lastInterstitialTime = 0;
    const COOLDOWN_MS = 3 * 60 * 1000; 

    // Управление паузой
    const triggerGamePause = (isMuted) => {
        try {
            emit('pause_state_changed', isMuted);
            emit('audio_state_changed', !isMuted);

            if (isMuted) {
                Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
                Object.defineProperty(document, 'hidden', { value: true, configurable: true });
                document.dispatchEvent(new Event('visibilitychange'));
                delete document.visibilityState;
                delete document.hidden;
                window.dispatchEvent(new Event('blur'));
                if (typeof window.gameBlur === 'function') window.gameBlur();
            } else {
                Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
                Object.defineProperty(document, 'hidden', { value: false, configurable: true });
                document.dispatchEvent(new Event('visibilitychange'));
                delete document.visibilityState;
                delete document.hidden;
                window.dispatchEvent(new Event('focus'));
                if (typeof window.gameFocus === 'function') window.gameFocus();
            }
        } catch (e) { console.warn("Pause error:", e); }
    };

    // Вспомогательные заглушки для модулей v2.3.1
    const stub = (val = undefined) => () => Promise.resolve(val);
    const stubArray = () => Promise.resolve([]);

    // 4. Полноценный Mock SDK версии 2.3.1
    const mockBridge = {
        version: "2.3.1", 
        isInitialized: true,
        initialize: () => Promise.resolve(), // Мгновенный резолв убирает необходимость во внешнем config.json (ошибка 404 уйдет)
        on: on, 
        off: off,
        once: once,
        emit: emit,

        PLATFORM_ID: { MOCK: 'mock', PLAYGAMA: 'playgama' },
        PLATFORM_MESSAGE: { GAME_READY: 'game_ready', LEVEL_STARTED: 'level_started', LEVEL_COMPLETED: 'level_completed', LEVEL_FAILED: 'level_failed' },
        INTERSTITIAL_STATE: { LOADING: 'loading', OPENED: 'opened', CLOSED: 'closed', FAILED: 'failed' },
        REWARDED_STATE: { LOADING: 'loading', OPENED: 'opened', CLOSED: 'closed', FAILED: 'failed', REWARDED: 'rewarded' },
        BANNER_STATE: { LOADING: 'loading', SHOWN: 'shown', HIDDEN: 'hidden', FAILED: 'failed' },
        VISIBILITY_STATE: { VISIBLE: 'visible', HIDDEN: 'hidden' },

        EVENT_NAME: {
            INTERSTITIAL_STATE_CHANGED: 'interstitial_state_changed',
            REWARDED_STATE_CHANGED: 'rewarded_state_changed',
            BANNER_STATE_CHANGED: 'banner_state_changed',
            VISIBILITY_STATE_CHANGED: 'visibility_state_changed',
            AUDIO_STATE_CHANGED: 'audio_state_changed',
            PAUSE_STATE_CHANGED: 'pause_state_changed'
        },

        // Платформа. Жестко переопределяем ID, чтобы игры не искали другие площадки.
        platform: { 
            id: 'playgama', 
            language: navigator.language ? navigator.language.substring(0, 2).toLowerCase() : 'en', 
            payload: 'forciblySetPlatformId=playgama', 
            tld: null,
            isAudioEnabled: true, 
            isPaused: false,
            sendMessage: stub(), 
            sendCustomMessage: stub(),
            getServerTime: () => Promise.resolve(Date.now()), 
            on: on 
        },
        device: { 
            type: /android|iphone|ipad|ipod/i.test(navigator.userAgent) ? 'mobile' : 'desktop', 
            os: /android/i.test(navigator.userAgent) ? 'android' : (/iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'windows') 
        },
        player: { 
            isAuthorizationSupported: false, // Отключаем запросы авторизации
            isAuthorized: false, 
            id: 'guest', 
            name: 'Guest', 
            photos: [], 
            authorize: stub(), 
            on: on 
        },
        game: { visibilityState: 'visible', setLoadingProgress: () => {}, on: on },
        
        // Локальное хранилище с префиксом (поддержка массивов ключей из v2)
        storage: {
            defaultType: 'local_storage',
            isSupported: stub(true),
            isAvailable: stub(true),
            get: (key) => {
                const f = (k) => {
                    if (k === 'bridge_player_guest_id') return 'GAME_Permanent_Guest';
                    const val = localStorage.getItem(`pg_save_${k}`);
                    try { return val ? JSON.parse(val) : null; } catch { return val; }
                };
                return Promise.resolve(Array.isArray(key) ? key.map(f) : f(key));
            },
            set: (key, val) => {
                const s = (k, v) => localStorage.setItem(`pg_save_${k}`, JSON.stringify(k === 'bridge_player_guest_id' ? 'GAME_Permanent_Guest' : v));
                if (Array.isArray(key)) key.forEach((k, i) => s(k, val[i])); else s(key, val);
                return Promise.resolve();
            },
            delete: (key) => {
                if (Array.isArray(key)) key.forEach(k => localStorage.removeItem(`pg_save_${k}`));
                else localStorage.removeItem(`pg_save_${key}`);
                return Promise.resolve();
            }
        },

        // Реклама (асинхронная связка с pgAds)
        advertisement: {
            on: on,
            isInterstitialSupported: true, 
            isRewardedSupported: true, 
            isBannerSupported: true,
            isAdvancedBannersSupported: true,
            minimumDelayBetweenInterstitial: 60,
            setMinimumDelayBetweenInterstitial: () => {},
            showBanner: () => {}, hideBanner: () => {}, 
            showAdvancedBanners: () => {}, hideAdvancedBanners: () => {},
            checkAdBlock: stub(false),

            showInterstitial: () => {
                return new Promise((resolve) => {
                    let now = Date.now();
                    if (now - lastInterstitialTime < COOLDOWN_MS) {
                        emit('interstitial_state_changed', 'opened');
                        setTimeout(() => { emit('interstitial_state_changed', 'closed'); resolve(false); }, 50);
                        return;
                    }
                    lastInterstitialTime = now;
                    
                    triggerGamePause(true); 
                    emit('interstitial_state_changed', 'opened');

                    const closeAd = () => {
                        window._forceCloseRewardedAd = null;
                        emit('interstitial_state_changed', 'closed'); 
                        triggerGamePause(false); 
                        window.focus(); let cvs = document.querySelector('canvas'); if (cvs) cvs.focus();
                        resolve(true);
                    };

                    if (window.pgAds) {
                        window.pgAds.requestOutOfPageAd('interstitial').then(b => {
                            if (!b) return closeAd();
                            let isDone = false;
                            const h = () => { if(!isDone){ isDone=true; closeAd(); }};
                            window._forceCloseRewardedAd = h;
                            
                            if (b.state === 'empty' || b.state === 'error' || b.state === 'closed') return h();
                            
                            ['close','complete','skip','error','empty'].forEach(e => b.addEventListener(e, h));
                            
                            if (b.state === 'ready') b.show();
                            else b.addEventListener('ready', () => b.show());

                            setTimeout(() => { if (!isDone && b.state === 'loading') h(); }, 8000);
                        }).catch(closeAd);
                    } else closeAd();
                });
            },

            showRewarded: () => {
                return new Promise((resolve) => {
                    triggerGamePause(true);
                    emit('rewarded_state_changed', 'opened');

                    const closeAd = (success) => {
                        window._forceCloseRewardedAd = null;
                        if (success) emit('rewarded_state_changed', 'rewarded');
                        setTimeout(() => {
                            emit('rewarded_state_changed', 'closed');
                            triggerGamePause(false);
                            resolve(success);
                        }, 50);
                    };

                    if (window.pgAds) {
                        window.pgAds.requestOutOfPageAd('rewarded').then(b => {
                            if (!b) return closeAd(false);
                            let isRew = false, isDone = false;
                            b.addEventListener('rewarded', () => isRew = true);
                            const h = (f) => { if(!isDone){ isDone=true; closeAd(isRew || f===true); }};
                            window._forceCloseRewardedAd = h;
                            
                            if (b.state === 'empty' || b.state === 'error' || b.state === 'closed') return h(false);
                            
                            ['close','complete','skip','error','empty'].forEach(e => b.addEventListener(e, h));
                            
                            if (b.state === 'ready') b.show();
                            else b.addEventListener('ready', () => b.show());

                            setTimeout(() => { if (!isDone && b.state === 'loading') h(false); }, 8000);
                        }).catch(() => closeAd(false));
                    } else closeAd(false);
                });
            }
        },
        
        // Все новые модули из v2.3.1 — возвращают стабильные Promise-пустышки, чтобы движки скрывали кнопки, не вызывая ошибок
        leaderboards: { isSupported: false, setScore: stub(), getEntries: stubArray(), showNativePopup: stub(), on: on }, // В v2 это leaderboards, не leaderboard
        social: { isShareSupported: false, isJoinCommunitySupported: false, isInviteFriendsSupported: false, isCreatePostSupported: false, isAddToHomeScreenSupported: false, isAddToFavoritesSupported: false, isRateSupported: false, isPostRewardSupported: false, inviteFriends: stub(), joinCommunity: stub(), share: stub(), createPost: stub(), addToHomeScreen: stub(), getAddToHomeScreenReward: stub(), addToFavorites: stub(), getAddToFavoritesReward: stub(), rate: stub(), getPostReward: stubArray(), on: on },
        remoteConfig: { isSupported: false, setContext: () => {}, get: stub({}) },
        payments: { isSupported: false, purchase: stub(), getPurchases: stubArray(), getCatalog: stubArray(), consumePurchase: stub() },
        clipboard: { isSupported: false, read: stub(""), write: stub() },
        achievements: { isSupported: false, unlock: stub(), getList: stubArray() },
        notifications: { isSupported: false, schedule: stub(), cancel: stub(), cancelAll: stub() },
        analytics: { send: () => {} },
        dailyRewards: { getRewards: stubArray(), getCurrentDay: stub(0), getCurrentReward: stub(null), claimCurrentReward: stub(false) },
        tasks: { getTasks: stubArray(), addProgress: stub(false), claimReward: stub(false) },
        crossPromo: { getGames: stubArray(), show: stub(), hide: () => {} }
    };
    
    // Экспортируем глобальные объекты для всех типов сборок
    window.bridge = mockBridge;
    window.playgamaBridge = mockBridge;
    window.ysdk = mockBridge; // Резерв для форков Яндекса
})();