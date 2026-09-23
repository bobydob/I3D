(function () {
    'use strict';

    function unavailable(operation, reason) {
        return Promise.reject({
            code: 'firebase/unavailable',
            message: 'Firebase is unavailable: ' + operation,
            operation: operation,
            reason: reason || 'unknown'
        });
    }

    function emptySnapshot() {
        return {
            val: function () { return null; },
            exists: function () { return false; }
        };
    }

    function createFallbackRef(path, reason) {
        return {
            key: path || null,
            once: function () { return Promise.resolve(emptySnapshot()); },
            set: function () { return unavailable('database.set', reason); },
            update: function () { return unavailable('database.update', reason); },
            remove: function () { return unavailable('database.remove', reason); },
            push: function () { return createFallbackRef((path ? path + '/' : '') + 'fallback', reason); },
            on: function (eventName, callback) {
                if (eventName === 'value' && typeof callback === 'function') {
                    setTimeout(function () { callback(emptySnapshot()); }, 0);
                }
                return callback;
            },
            off: function () {},
            transaction: function () {
                return Promise.resolve({ committed: false, snapshot: emptySnapshot() });
            }
        };
    }

    function createFallbackDatabase(reason) {
        return function () {
            return {
                ref: function (path) { return createFallbackRef(path || '', reason); }
            };
        };
    }

    function createFallbackAuth(reason) {
        var instance = {
            currentUser: null,
            createUserWithEmailAndPassword: function () {
                return unavailable('auth.createUserWithEmailAndPassword', reason);
            },
            signInWithEmailAndPassword: function () {
                return unavailable('auth.signInWithEmailAndPassword', reason);
            },
            signInWithCustomToken: function () {
                return unavailable('auth.signInWithCustomToken', reason);
            },
            signInWithRedirect: function () {
                return unavailable('auth.signInWithRedirect', reason);
            },
            signOut: function () { return Promise.resolve(); },
            onAuthStateChanged: function (callback) {
                if (typeof callback === 'function') {
                    setTimeout(function () { callback(null); }, 0);
                }
                return function () {};
            }
        };

        var factory = function () { return instance; };
        factory.GoogleAuthProvider = function FirebaseFallbackGoogleAuthProvider() {};
        factory.FacebookAuthProvider = function FirebaseFallbackFacebookAuthProvider() {};
        return factory;
    }

    function createFallbackAnalytics() {
        return function () {
            return { logEvent: function () {} };
        };
    }

    function createFallbackNamespace(reason) {
        var auth = createFallbackAuth(reason);
        var database = createFallbackDatabase(reason);
        var analytics = createFallbackAnalytics();
        var app = {
            name: '[DEFAULT]',
            options: {},
            auth: auth,
            database: database,
            analytics: analytics
        };

        return {
            __isFirebaseWebGLFallback: true,
            apps: [app],
            app: function () { return app; },
            initializeApp: function () { return app; },
            auth: auth,
            database: database,
            analytics: analytics
        };
    }

    window.installFirebaseWebGLFallback = function (reason) {
        var fallbackReason = reason || 'firebase-webgl-fallback';
        var namespace = createFallbackNamespace(fallbackReason);
        window.firebase = namespace;
        window.firebaseApp = namespace.app();
        window.auth = namespace.auth();
        window.__firebaseWebGLFallbackActive = true;
        window.__firebaseWebGLFallbackReason = fallbackReason;
        window.__firebaseWebGLReady = false;
        return window.firebaseApp;
    };

    var firebaseConfig = {
        apiKey: 'AIzaSyCkUsKjkusaolY4nx7hpcXA3jtYDLmyPeg',
        authDomain: 'imposter-3d-eb94a.firebaseapp.com',
        databaseURL: 'https://imposter-3d-eb94a-default-rtdb.europe-west1.firebasedatabase.app',
        projectId: 'imposter-3d-eb94a',
        storageBucket: 'imposter-3d-eb94a.appspot.com',
        messagingSenderId: '638976822787',
        appId: '1:638976822787:web:36b896caed3e68677e4836',
        measurementId: 'G-TCSK8RSZ3Q'
    };

    try {
        if (!window.firebase || typeof window.firebase.initializeApp !== 'function' ||
            typeof window.firebase.database !== 'function' || typeof window.firebase.auth !== 'function') {
            throw new Error('Firebase compatibility SDK did not load');
        }

        window.firebaseApp = Array.isArray(window.firebase.apps) && window.firebase.apps.length > 0
            ? window.firebase.app()
            : window.firebase.initializeApp(firebaseConfig);
        window.auth = window.firebase.auth();
        window.__firebaseWebGLFallbackActive = false;
        window.__firebaseWebGLFallbackReason = '';
        window.__firebaseWebGLReady = true;
    } catch (error) {
        console.error('[FirebaseWebGL] Initialization failed.', error);
        window.installFirebaseWebGLFallback(error && error.message ? error.message : 'firebase-init-failed');
    }
}());
