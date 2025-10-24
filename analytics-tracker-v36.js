/**
 * 🎬 Insight Stream Analytics Tracker - FINAL VERSION
 * Complete analytics tracking with DOM capture, SPA navigation, and session replay
 * 
 * Version: 3.3.1
 * Last Updated: 2025-10-24
 * 
 * Features:
 * - Real-time pageview tracking
 * - Custom event tracking
 * - Session replay with DOM capture
 * - SPA navigation tracking
 * - User behavior analytics
 * - Performance monitoring
 * 
 * Usage:
 * <script>
 *   window.__TRACKING_ID__ = 'your_tracking_id';
 *   window.__PROJECT_ID__ = 'your_project_id';
 * </script>
 * <script src="https://your-cdn.com/analytics-tracker-final.js"></script>
 */
(function() {
  'use strict';
  
  // Add comprehensive polyfills BEFORE any rrweb code
  if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.matchesSelector || 
      Element.prototype.mozMatchesSelector || 
      Element.prototype.msMatchesSelector || 
      Element.prototype.oMatchesSelector || 
      Element.prototype.webkitMatchesSelector || 
      function(s) {
        var matches = (this.document || this.ownerDocument).querySelectorAll(s),
            i = matches.length;
        while (--i >= 0 && matches.item(i) !== this) {}
        return i > -1;            
      };
  }
  
  // Force polyfill on all existing elements
  var allElements = document.querySelectorAll('*');
  for (var i = 0; i < allElements.length; i++) {
    if (!allElements[i].matches) {
      allElements[i].matches = Element.prototype.matches;
    }
  }
  
  // Add matches to NodeList prototype for better compatibility
  if (NodeList.prototype && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
  }
  
  // Ensure all elements have matches method
  var originalCreateElement = document.createElement;
  document.createElement = function(tagName) {
    var element = originalCreateElement.call(this, tagName);
    if (!element.matches) {
      element.matches = Element.prototype.matches;
    }
    return element;
  };
  
  // Supabase configuration
  var SUPABASE_URL = 'https://ovaagxrbaxxhlrhbyomt.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92YWFneHJiYXh4aGxyaGJ5b210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NjcxNTMsImV4cCI6MjA3NTQ0MzE1M30.NpR3791btOTVak--m-gQNK6KyJCRN8wbQThGPeCmX98';
  
  // Configuration
  var config = {
    apiBaseUrl: SUPABASE_URL + '/functions/v1',
    sessionRecordingEnabled: false, // Will be set dynamically from database
    // DOM capture removed - using rrweb only
    compressionEnabled: true,
    performanceTracking: true,
    errorTracking: true,
    debugMode: true
  };

  // Get tracking configuration - will be set in initialize()
  var trackingId = 'your_tracking_id_here';
  var projectId = 'your_project_id_here';
  
  // API endpoints
  var apiUrls = {
    track: config.apiBaseUrl + '/track',
    behavior: config.apiBaseUrl + '/track-behavior',
    sessionReplay: config.apiBaseUrl + '/track-session-replay'
  };

  // Session management
  var sessionId = null;
  var visitorId = null; // Persistent visitor ID across sessions
  var sessionReplayBuffer = [];
  // DOM capture variables removed - using rrweb only
  var performanceData = {};
  var errorCount = 0;

  // Emotion tracking system
  var emotionState = {
    currentState: 'neutral', // neutral, hesitation, frustration, recovery, conversion, bounce
    intensity: 0, // 0-100 scale
    frustrationScore: 0,
    lastInteractionTime: Date.now(),
    interactionCount: 0,
    rapidClicks: 0,
    deadClicks: 0,
    scrollStalls: 0,
    formChurns: 0,
    idleSpikes: 0,
    backtrackEvents: 0,
    rageClickThreshold: 3, // clicks within 1 second
    deadClickThreshold: 2000, // 2 seconds without response
    scrollStallThreshold: 3000, // 3 seconds without scroll
    idleThreshold: 10000, // 10 seconds of inactivity
    stateHistory: []
  };

  var behavioralEvents = [];
  var lastClickTime = 0;
  var lastScrollTime = 0;
  var lastInputTime = 0;
  var currentScrollDepth = 0;
  var maxScrollDepth = 0;
  var formFieldChanges = 0;
  var currentForm = null;

  // Utility functions
  function log(message, data) {
    if (config.debugMode) {
      console.log('📊 [Analytics]', message, data || '');
    }
  }

  function warn(message, data) {
    console.warn('⚠️ [Analytics]', message, data || '');
  }

  function error(message, data) {
    console.error('❌ [Analytics]', message, data || '');
  }

  function debug(message, data) {
    if (config.debugMode) {
      console.log('🔍 [Debug]', message, data || '');
    }
  }

  // Emotion detection functions
  function calculateScrollDepth() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var documentHeight = document.documentElement.scrollHeight - window.innerHeight;
    return documentHeight > 0 ? Math.round((scrollTop / documentHeight) * 100) : 0;
  }

  function detectRageClick(currentTime) {
    var timeSinceLastClick = currentTime - lastClickTime;
    if (timeSinceLastClick < 1000) { // Less than 1 second
      emotionState.rapidClicks++;
      return true;
    }
    return false;
  }

  function detectDeadClick(element) {
    // Skip if element is null (e.g., mousemove events)
    if (!element) return false;
    
    // Check if click was on non-interactive element or empty space
    var isInteractive = element.tagName === 'A' || 
                       element.tagName === 'BUTTON' || 
                       element.tagName === 'INPUT' || 
                       element.tagName === 'SELECT' ||
                       element.onclick ||
                       element.getAttribute('role') === 'button' ||
                       element.classList.contains('clickable') ||
                       element.classList.contains('btn');
    
    if (!isInteractive) {
      emotionState.deadClicks++;
      return true;
    }
    return false;
  }

  function detectScrollStall(currentTime) {
    var timeSinceLastScroll = currentTime - lastScrollTime;
    if (timeSinceLastScroll > emotionState.scrollStallThreshold) {
      emotionState.scrollStalls++;
      return true;
    }
    return false;
  }

  function detectFormChurn() {
    if (formFieldChanges > 5) { // More than 5 field changes
      emotionState.formChurns++;
      return true;
    }
    return false;
  }

  function detectIdleSpike(currentTime) {
    var timeSinceLastInteraction = currentTime - emotionState.lastInteractionTime;
    if (timeSinceLastInteraction > emotionState.idleThreshold) {
      emotionState.idleSpikes++;
      return true;
    }
    return false;
  }

  function detectBacktrack() {
    var currentDepth = calculateScrollDepth();
    if (currentDepth < currentScrollDepth - 20) { // Scrolled back up significantly
      emotionState.backtrackEvents++;
      return true;
    }
    return false;
  }

  function updateEmotionState(eventType, element, eventData) {
    var currentTime = Date.now();
    emotionState.lastInteractionTime = currentTime;
    emotionState.interactionCount++;

    debug('Emotion state update started', {
      eventType: eventType,
      element: element ? element.tagName : 'null',
      interactionCount: emotionState.interactionCount,
      currentState: emotionState.currentState,
      frustrationScore: emotionState.frustrationScore
    });

    var frustrationSignals = 0;
    var totalSignals = 0;

    // Detect frustration signals based on event type
    switch (eventType) {
      case 'click':
        var rageClick = detectRageClick(currentTime);
        var deadClick = element && detectDeadClick(element);
        if (rageClick) frustrationSignals++;
        if (deadClick) frustrationSignals++;
        totalSignals += 2;
        lastClickTime = currentTime;
        debug('Click analysis', { rageClick, deadClick, frustrationSignals, totalSignals });
        break;

      case 'scroll':
        currentScrollDepth = calculateScrollDepth();
        maxScrollDepth = Math.max(maxScrollDepth, currentScrollDepth);
        var scrollStall = detectScrollStall(currentTime);
        var backtrack = detectBacktrack();
        if (scrollStall) frustrationSignals++;
        if (backtrack) frustrationSignals++;
        totalSignals += 2;
        lastScrollTime = currentTime;
        debug('Scroll analysis', { 
          scrollDepth: currentScrollDepth, 
          maxScrollDepth, 
          scrollStall, 
          backtrack, 
          frustrationSignals, 
          totalSignals 
        });
        break;

        
      case 'input':
        // Skip input events for emotion detection (they're now sent as click)
        debug('Input event skipped for emotion detection');
        break;

      case 'mousemove':
        // Skip mousemove events for emotion detection (they're now sent as click)
        debug('Mousemove event skipped for emotion detection');
        break;
    }

    // Calculate frustration score (0-100)
    var frustrationRatio = totalSignals > 0 ? frustrationSignals / totalSignals : 0;
    var oldFrustrationScore = emotionState.frustrationScore;
    emotionState.frustrationScore = Math.min(100, emotionState.frustrationScore + (frustrationRatio * 10));

    debug('Frustration calculation', {
      frustrationRatio: frustrationRatio,
      oldScore: oldFrustrationScore,
      newScore: emotionState.frustrationScore,
      frustrationSignals: frustrationSignals,
      totalSignals: totalSignals
    });

    // Determine emotional state
    var previousState = emotionState.currentState;
    if (emotionState.frustrationScore > 70) {
      emotionState.currentState = 'frustration';
      emotionState.intensity = Math.min(100, emotionState.frustrationScore);
    } else if (emotionState.frustrationScore > 40) {
      emotionState.currentState = 'hesitation';
      emotionState.intensity = emotionState.frustrationScore;
    } else if (emotionState.frustrationScore < 20 && emotionState.interactionCount > 5) {
      emotionState.currentState = 'conversion';
      emotionState.intensity = 100 - emotionState.frustrationScore;
    } else {
      emotionState.currentState = 'neutral';
      emotionState.intensity = 50;
    }

    debug('Emotion state determination', {
      previousState: previousState,
      newState: emotionState.currentState,
      intensity: emotionState.intensity,
      frustrationScore: emotionState.frustrationScore,
      interactionCount: emotionState.interactionCount
    });

    // Record state change
    if (previousState !== emotionState.currentState) {
      emotionState.stateHistory.push({
        timestamp: currentTime,
        fromState: previousState,
        toState: emotionState.currentState,
        intensity: emotionState.intensity,
        frustrationScore: emotionState.frustrationScore
      });
      debug('Emotion state changed', {
        from: previousState,
        to: emotionState.currentState,
        stateHistoryLength: emotionState.stateHistory.length
      });
    }

    // Create behavioral event
    var behavioralEvent = {
      event_type: eventType,
      timestamp: currentTime,
      state: emotionState.currentState,
      intensity: emotionState.intensity,
      frustration_score: emotionState.frustrationScore,
      scroll_depth: currentScrollDepth,
      max_scroll_depth: maxScrollDepth,
      element: element ? {
        tagName: element.tagName,
        className: element.className,
        id: element.id,
        text: element.textContent ? element.textContent.substring(0, 100) : ''
      } : null,
      page_path: window.location.pathname,
      session_id: sessionId,
      project_id: projectId,
      metadata: {
        rapidClicks: emotionState.rapidClicks,
        deadClicks: emotionState.deadClicks,
        scrollStalls: emotionState.scrollStalls,
        formChurns: emotionState.formChurns,
        idleSpikes: emotionState.idleSpikes,
        backtrackEvents: emotionState.backtrackEvents,
        interactionCount: emotionState.interactionCount
      }
    };

    behavioralEvents.push(behavioralEvent);
    
    debug('Behavioral event created', {
      eventType: behavioralEvent.event_type,
      state: behavioralEvent.state,
      intensity: behavioralEvent.intensity,
      frustrationScore: behavioralEvent.frustration_score,
      bufferLength: behavioralEvents.length
    });
    
    // Send behavioral event if buffer is full or significant state change
    if (behavioralEvents.length >= 10 || previousState !== emotionState.currentState) {
      debug('Triggering behavioral events send', {
        reason: behavioralEvents.length >= 10 ? 'buffer_full' : 'state_change',
        bufferLength: behavioralEvents.length,
        stateChanged: previousState !== emotionState.currentState
      });
      sendBehavioralEvents();
    }

    log('Emotion state updated', {
      state: emotionState.currentState,
      intensity: emotionState.intensity,
      frustrationScore: emotionState.frustrationScore
    });
  }

  function sendBehavioralEvents(retryCount = 0) {
    if (behavioralEvents.length === 0) return;

    var eventsToSend = behavioralEvents.splice(0, behavioralEvents.length);
    var maxRetries = 3;
    
    debug('Sending behavioral events', {
      count: eventsToSend.length,
      retryCount: retryCount,
      maxRetries: maxRetries,
      sessionId: sessionId,
      projectId: projectId,
      trackingId: trackingId,
      currentState: emotionState.currentState,
      frustrationScore: emotionState.frustrationScore
    });
    
    var requestBody = {
      tracking_id: trackingId,
      project_id: projectId,
      session_id: sessionId,
      events: eventsToSend,
      emotion_state: {
        currentState: emotionState.currentState,
        intensity: emotionState.intensity,
        frustrationScore: emotionState.frustrationScore,
        stateHistory: emotionState.stateHistory.slice(-10) // Last 10 state changes
      }
    };
    
    debug('Request body prepared', {
      bodySize: JSON.stringify(requestBody).length,
      eventTypes: eventsToSend.map(e => e.event_type),
      emotionStateHistoryLength: emotionState.stateHistory.length
    });
    
    fetch(apiUrls.behavior, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to send behavioral events - ' + response.status);
      }
      log('Behavioral events sent', { count: eventsToSend.length });
    })
    .catch(err => {
      if (retryCount < maxRetries) {
        // Retry with exponential backoff
        setTimeout(() => {
          behavioralEvents.unshift(...eventsToSend);
          sendBehavioralEvents(retryCount + 1);
        }, Math.pow(2, retryCount) * 1000); // 1s, 2s, 4s
      } else {
        error('Failed to send behavioral events after ' + maxRetries + ' retries', err);
        // Don't re-add events to buffer after max retries to prevent infinite loops
      }
    });
  }

  // Performance tracking
  function capturePerformanceData() {
    if (!config.performanceTracking) return;
    
    try {
      var navigation = performance.getEntriesByType('navigation')[0];
      var paint = performance.getEntriesByType('paint');
      
      performanceData = {
        loadTime: navigation ? navigation.loadEventEnd - navigation.loadEventStart : 0,
        domContentLoaded: navigation ? navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart : 0,
        firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
        connectionType: navigator.connection?.effectiveType || 'unknown',
        memoryUsage: performance.memory ? {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit
        } : null
      };
      
      log('Performance data captured', performanceData);
    } catch (e) {
      warn('Failed to capture performance data:', e.message);
    }
  }

  // Error tracking
  function setupErrorTracking() {
    if (!config.errorTracking) return;
    
    window.addEventListener('error', function(event) {
      errorCount++;
      addToReplayBuffer({
        type: 'error',
        data: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      });
    });
    
    window.addEventListener('unhandledrejection', function(event) {
      errorCount++;
      addToReplayBuffer({
        type: 'unhandledrejection',
        data: {
          reason: event.reason?.toString(),
          stack: event.reason?.stack,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      });
    });
  }

  // rrweb recording setup
  let rrwebRecorder = null;
  let rrwebEvents = [];
  
  function startRRWebRecording() {
    try {
      // CRITICAL: Check if session recording is actually enabled
      if (!config.sessionRecordingEnabled) {
        console.log('🚫 [Session Recording] BLOCKED - Session recording is disabled in database');
        console.log('📊 [Session Recording] Flag value:', config.sessionRecordingEnabled);
        console.log('💡 [Session Recording] Enable recording in the Users tab of the admin panel');
        return;
      }
      
      debug('Starting rrweb recording', {
        rrwebAlreadyLoaded: typeof window.rrweb !== 'undefined',
        sessionRecordingEnabled: config.sessionRecordingEnabled
      });
      
      // Load rrweb if not already loaded
      if (typeof window.rrweb === 'undefined') {
        log('Loading rrweb...');
        
        // Try your CDN first (most reliable)
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/gh/ecyb/daynight_tracking@main/rrweb.min.js';
        script.onload = function() {
          log('rrweb loaded from GitHub CDN');
          debug('rrweb script loaded successfully from GitHub CDN');
          initializeRRWeb();
        };
        script.onerror = function() {
          warn('Failed to load rrweb from GitHub CDN, trying unpkg...');
          debug('GitHub CDN failed, trying unpkg fallback');
          // Try unpkg as fallback
          const fallbackScript = document.createElement('script');
          fallbackScript.src = 'https://unpkg.com/rrweb@latest/dist/rrweb.min.js';
          fallbackScript.onload = function() {
            log('rrweb loaded from unpkg CDN');
            debug('rrweb script loaded successfully from unpkg CDN');
            initializeRRWeb();
          };
          fallbackScript.onerror = function() {
            warn('Failed to load rrweb from unpkg, trying jsdelivr...');
            debug('unpkg CDN failed, trying jsdelivr fallback');
            // Try jsdelivr as second fallback
            const jsdelivrFallback = document.createElement('script');
            jsdelivrFallback.src = 'https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb.min.js';
            jsdelivrFallback.onload = function() {
              log('rrweb loaded from jsdelivr CDN');
              debug('rrweb script loaded successfully from jsdelivr CDN');
              initializeRRWeb();
            };
            jsdelivrFallback.onerror = function() {
              warn('Failed to load rrweb from all CDNs - session recording disabled');
              debug('All CDN attempts failed - session recording disabled');
            };
            document.head.appendChild(jsdelivrFallback);
          };
          document.head.appendChild(fallbackScript);
        };
        
        // Timeout fallback after 8 seconds
        setTimeout(function() {
          if (typeof window.rrweb === 'undefined') {
            warn('rrweb loading timeout - session recording disabled');
            debug('rrweb loading timeout after 8 seconds');
          }
        }, 8000);
        
        document.head.appendChild(script);
      } else {
        debug('rrweb already loaded, initializing directly');
        initializeRRWeb();
      }
    } catch (error) {
      warn('Failed to start rrweb recording:', error);
      debug('Exception in startRRWebRecording:', error);
    }
  }
  
  function initializeRRWeb() {
    try {
      // DOUBLE CHECK: Ensure session recording is still enabled
      if (!config.sessionRecordingEnabled) {
        console.log('🚫 [Session Recording] BLOCKED in initializeRRWeb - Session recording is disabled');
        console.log('📊 [Session Recording] Flag value:', config.sessionRecordingEnabled);
        return;
      }
      
      log('Initializing rrweb recorder...');
      
      // Check if rrweb is properly loaded
      if (typeof window.rrweb === 'undefined' || !window.rrweb.record) {
        warn('rrweb not properly loaded, cannot initialize recorder');
        return;
      }
      
      // Element.matches polyfill already added at script start
      
      let typeCounts = { meta:0, full:0, inc:0, cust:0, other:0 };
      
      rrwebRecorder = window.rrweb.record({
        emit(event) {
          try {
            // Don't process events if recording is disabled
            if (!config.sessionRecordingEnabled) {
              return;
            }
            // sanity: count types
            switch (event.type) {
              case 4: typeCounts.meta++; break;             // Meta
              case 2: typeCounts.full++; break;             // FullSnapshot
              case 3: typeCounts.inc++; break;              // Incremental
              case 5: typeCounts.cust++; break;             // Custom
              default: typeCounts.other++; break;
            }

            // Add to buffer for session replay (only if recording is enabled)
            if (config.sessionRecordingEnabled) {
              rrwebEvents.push(event);
              addToReplayBuffer({
                type: 'rrweb_event',
                data: event,
                timestamp: Date.now()
              });
            }
            
            // useful breadcrumbs
            if (event.type === 4) log('rrweb: Meta event captured');
            if (event.type === 2) log('rrweb: Full snapshot captured');
            if (event.type === 3) log('rrweb: Incremental snapshot captured');
          } catch (error) {
            // Silently handle rrweb emit errors to prevent breaking the recording
            console.warn('rrweb emit error (handled):', error.message);
          }
        },
        // Record canvas replays, inline stylesheets/fonts to reduce external deps in replay
        recordCanvas: true,
        inlineStylesheet: true,
        // Sampling to keep payload sane without killing fidelity
        sampling: {
          mousemove: 50,          // throttle mousemove to every 50ms
          scroll: 100,            // throttle scroll
          media: true,            // track <audio>/<video>
          input: 'last',          // record the last input in a burst
        },
        // Privacy: mask sensitive stuff; tune to your app
        maskAllInputs: false,
        maskTextSelector: '[data-mask], [type="password"]',
        // blockSelector: '[data-replay-block]', // TEMPORARILY DISABLED - elements you NEVER want to record
        // Periodic full snapshots help recovery
        checkoutEveryNms: 2 * 60 * 1000, // 2 min
        checkoutEveryNth: 0,
        // Additional options for better fidelity
        collectFonts: true,
      });
      
      // FORCE a full snapshot right after starting (some CSPs/timing shenanigans block the initial one)
      if (window.rrweb?.record?.takeFullSnapshot) {
        window.rrweb.record.takeFullSnapshot(true);
        log('rrweb: takeFullSnapshot() called explicitly');
      }
      
      // After a tick, verify we have a baseline
      setTimeout(() => {
        log('rrweb type counts:', JSON.stringify(typeCounts));
        if (typeCounts.full === 0) {
          warn('❌ No FullSnapshot recorded. Replays will be blank.');
          warn('Check: server not dropping large events? blockSelector not nuking root? CSP errors in console?');
        }
      }, 1000);
      
      log('✅ rrweb recording started');
    } catch (error) {
      warn('Failed to initialize rrweb:', error);
    }
  }
  
  function stopRRWebRecording() {
    if (rrwebRecorder) {
      try {
        rrwebRecorder();
        rrwebRecorder = null;
        log('rrweb recording stopped');
      } catch (error) {
        warn('Failed to stop rrweb recording:', error);
      }
    }
  }

  // DOM capture removed - using rrweb only

  // DOM capture functions removed - using rrweb only

  // Enhanced event capture
  function addToReplayBuffer(event) {
    if (!config.sessionRecordingEnabled) return;
    
    sessionReplayBuffer.push({
      type: event.type,
      data: event.data,
      timestamp: event.timestamp || Date.now()
      // Removed url field - backend doesn't expect it
    });
    
    // Send buffer when it gets large
    if (sessionReplayBuffer.length >= 10) {
      sendSessionReplayEvents();
    }
  }

  // Enhanced session replay sending
  function sendSessionReplayEvents(retryCount = 0) {
    if (sessionReplayBuffer.length === 0) return;
    
    // CRITICAL: Don't send session replay events if recording is disabled
    if (!config.sessionRecordingEnabled) {
      console.log('🚫 [Session Recording] BLOCKED sendSessionReplayEvents - Session recording is disabled');
      console.log('📊 [Session Recording] Flag value:', config.sessionRecordingEnabled);
      sessionReplayBuffer.length = 0; // Clear the buffer
      return;
    }
    
    var eventsToSend = sessionReplayBuffer.splice(0, 10);
    var maxRetries = 2; // Fewer retries for session replay to avoid blocking
    
    // Log what we're sending for debugging
    log('Sending session replay events:', {
      count: eventsToSend.length,
      types: eventsToSend.map(e => e.type),
      sessionId: sessionId,
      trackingId: trackingId
    });
    
    fetch(apiUrls.sessionReplay, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tracking_id: trackingId,
        sessionId: sessionId,
        events: eventsToSend,
        metadata: {
          url: window.location.href,
          title: document.title,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          userAgent: navigator.userAgent,
          timestamp: Date.now(),
          performance: performanceData,
          errorCount: errorCount
        }
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Session replay failed - ' + response.status + ' ' + response.statusText);
      }
      return response.json();
    })
    .then(data => {
      log('Session replay events sent successfully:', {
        count: eventsToSend.length,
        response: data
      });
    })
    .catch(error => {
      if (retryCount < maxRetries) {
        warn('Session replay failed, retrying...', {
          attempt: retryCount + 1,
          maxRetries: maxRetries,
          error: error.message
        });
        // Retry with shorter delay for session replay
        setTimeout(() => {
          sessionReplayBuffer.unshift(...eventsToSend);
          sendSessionReplayEvents(retryCount + 1);
        }, 500 * (retryCount + 1)); // 500ms, 1s
      } else {
        error('Session replay send failed after ' + maxRetries + ' retries:', error);
        // Don't re-add events to buffer after max retries
      }
    });
  }

  // Extract UTM parameters from URL
  function extractUTMParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || undefined,
      utm_medium: params.get('utm_medium') || undefined,
      utm_campaign: params.get('utm_campaign') || undefined
    };
  }

  // Pageview tracking
  function trackPageView() {
    var currentPath = window.location.pathname + window.location.search;
    var currentTime = Date.now();
    var utmParams = extractUTMParams();
    
    fetch(apiUrls.track, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tracking_id: trackingId,
        session_id: sessionId,
        visitor_id: visitorId,
        event_type: 'pageview',
        path: currentPath,
        referrer: document.referrer,
        user_agent: navigator.userAgent,
        screen_width: window.screen.width,
        screen_height: window.screen.height,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        utm_source: utmParams.utm_source,
        utm_medium: utmParams.utm_medium,
        utm_campaign: utmParams.utm_campaign,
        timestamp: currentTime
      })
    })
    .then(response => response.json())
    .then(data => {
      log('Page view tracked');
    })
    .catch(error => {
      warn('Page view tracking failed:', error);
    });
  }

  // Custom event tracking
  function trackCustomEvent(eventName, eventData) {
    fetch(apiUrls.track, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tracking_id: trackingId,
        session_id: sessionId,
        visitor_id: visitorId,
        event_type: 'event',
        event_name: eventName,
        event_data: eventData || {},
        timestamp: Date.now()
      })
    })
    .then(response => response.json())
    .then(data => {
      log('Custom event tracked:', eventName);
    })
    .catch(error => {
      warn('Custom event tracking failed:', error);
    });
  }

  // Event listeners
  function setupEventListeners() {
    // Mouse events
    document.addEventListener('click', function(e) {
      // Update emotion state
      updateEmotionState('click', e.target, {
        x: e.clientX,
        y: e.clientY,
        target: e.target.tagName,
        text: e.target.textContent?.substring(0, 50) || '',
        href: e.target.href || '',
        className: e.target.className || ''
      });

      addToReplayBuffer({
        type: 'click',
        data: {
          x: e.clientX,
          y: e.clientY,
          target: e.target.tagName,
          text: e.target.textContent?.substring(0, 50) || '',
          href: e.target.href || '',
          className: e.target.className || ''
        }
      });
    });

    // Mouse movement tracking (throttled)
    var mouseMoveTimeout;
    document.addEventListener('mousemove', function(e) {
      clearTimeout(mouseMoveTimeout);
      mouseMoveTimeout = setTimeout(function() {
        // Update emotion state (throttled)
        updateEmotionState('click', null, {
          x: e.clientX,
          y: e.clientY
        });

        addToReplayBuffer({
          type: 'mousemove',
          data: {
            x: e.clientX,
            y: e.clientY
          }
        });
      }, 100); // Throttle to every 100ms
    });

    // Scroll events
    var scrollTimeout;
    window.addEventListener('scroll', function() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(function() {
        // Update emotion state (throttled)
        updateEmotionState('scroll', null, {
          x: window.scrollX,
          y: window.scrollY,
          maxScrollY: document.documentElement.scrollHeight - window.innerHeight
        });

        addToReplayBuffer({
          type: 'scroll',
          data: {
            x: window.scrollX,
            y: window.scrollY,
            maxScrollY: document.documentElement.scrollHeight - window.innerHeight
          }
        });
      }, 100);
    });

    // Input events
    document.addEventListener('input', function(e) {
      if (e.target.type === 'password') return; // Don't capture passwords
      
      // Update emotion state - send as click since input is not allowed by database
      updateEmotionState('click', e.target, {
        value: e.target.value,
        type: e.target.type,
        name: e.target.name || '',
        placeholder: e.target.placeholder || '',
        id: e.target.id || ''
      });
      
      addToReplayBuffer({
        type: 'input',
        data: {
          value: e.target.value,
          type: e.target.type,
          name: e.target.name || '',
          placeholder: e.target.placeholder || '',
          id: e.target.id || ''
        }
      });
    });

    // Focus events
    document.addEventListener('focus', function(e) {
      addToReplayBuffer({
        type: 'focus',
        data: {
          target: e.target.tagName,
          id: e.target.id || '',
          className: e.target.className || ''
        }
      });
    }, true);

    // Blur events
    document.addEventListener('blur', function(e) {
      addToReplayBuffer({
        type: 'blur',
        data: {
          target: e.target.tagName,
          id: e.target.id || '',
          className: e.target.className || ''
        }
      });
    }, true);

    // Page visibility changes
    document.addEventListener('visibilitychange', function() {
      addToReplayBuffer({
        type: 'visibility_change',
        data: {
          hidden: document.hidden,
          visibilityState: document.visibilityState
        }
      });
    });

    // Resize events
    var resizeTimeout;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function() {
        addToReplayBuffer({
          type: 'resize',
          data: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        });
      }, 250);
    });
  }

  // SPA navigation tracking
  function setupSPANavigation() {
    var currentPagePath = window.location.pathname + window.location.search;
    var currentPageStartTime = Date.now();
    
    // Track pushState
    var originalPushState = history.pushState;
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      log('SPA Navigation detected (pushState):', window.location.pathname);
      
      // Track new page view after navigation
      trackPageView();
      
      // DOM capture removed - rrweb handles navigation automatically
    };

    // Track replaceState
    var originalReplaceState = history.replaceState;
    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      log('SPA Navigation detected (replaceState):', window.location.pathname);
      
      trackPageView();
      
      // DOM capture removed - rrweb handles navigation automatically
    };

    // Track popstate
    window.addEventListener('popstate', function() {
      log('SPA Navigation detected (popstate):', window.location.pathname);
      trackPageView();
      
      // DOM capture removed - rrweb handles navigation automatically
    });
  }

  // Send final emotion state on page unload
  function sendFinalEmotionState() {
    if (behavioralEvents.length > 0) {
      sendBehavioralEvents();
    }
    
    // Send final emotion state
    if (emotionState.interactionCount > 0) {
      fetch(apiUrls.behavior, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tracking_id: trackingId,
          project_id: projectId,
          session_id: sessionId,
          final_emotion_state: {
            currentState: emotionState.currentState,
            intensity: emotionState.intensity,
            frustrationScore: emotionState.frustrationScore,
            totalInteractions: emotionState.interactionCount,
            rapidClicks: emotionState.rapidClicks,
            deadClicks: emotionState.deadClicks,
            scrollStalls: emotionState.scrollStalls,
            formChurns: emotionState.formChurns,
            idleSpikes: emotionState.idleSpikes,
            backtrackEvents: emotionState.backtrackEvents,
            maxScrollDepth: maxScrollDepth,
            sessionDuration: Date.now() - emotionState.lastInteractionTime,
            stateHistory: emotionState.stateHistory
          }
        })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Final emotion state failed - ' + response.status);
        }
        log('Final emotion state sent successfully');
      })
      .catch(err => {
        error('Failed to send final emotion state', err);
      });
    }
  }

  // Session recording check - queries public database directly
  function checkSessionRecordingEnabled() {
    return fetch(
      SUPABASE_URL + '/rest/v1/session_recording_config?project_id=eq.' + projectId + '&select=enabled',
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        }
      }
    )
    .then(response => {
      if (!response.ok) {
        console.log('⚠️ [Session Recording] API Response Status:', response.status);
        throw new Error('Check recording failed - ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      console.log('📡 [Session Recording] Config data received:', data);
      var enabled = data.length > 0 ? data[0].enabled : false;
      if (enabled) {
        console.log('✅ [Session Recording] ENABLED - User interactions will be recorded');
        console.log('📊 [Session Recording] Project ID:', projectId);
        console.log('📊 [Session Recording] Tracking ID:', trackingId);
        console.log('📹 [Session Recording] Status: ACTIVE ✅');
        return true;
      } else {
        console.log('⛔ [Session Recording] DISABLED - No recording will take place');
        console.log('📊 [Session Recording] Project ID:', projectId);
        console.log('📊 [Session Recording] Tracking ID:', trackingId);
        console.log('📹 [Session Recording] Status: INACTIVE ❌');
        console.log('💡 [Session Recording] Enable recording in the Users tab of the admin panel');
        return false;
      }
    })
    .catch(error => {
      warn('Session recording check failed:', error);
      console.log('⚠️ [Session Recording] Check failed, defaulting to DISABLED for safety');
      console.log('📹 [Session Recording] Status: ERROR - DISABLED ❌');
      console.log('💡 [Session Recording] Ensure the session_recording_config table exists and has proper RLS policies');
      return false; // Default to disabled for safety
    });
  }

  // Initialize session
  function initializeSession() {
    sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    log('New session created:', sessionId);
    
    // Get or create persistent visitor ID
    try {
      visitorId = localStorage.getItem('_is_visitor_id');
      if (!visitorId) {
        visitorId = 'vis_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('_is_visitor_id', visitorId);
        log('New visitor ID created:', visitorId);
      } else {
        log('Existing visitor ID found:', visitorId);
      }
    } catch (e) {
      // If localStorage is not available, generate a session-only visitor ID
      visitorId = 'vis_temp_' + Math.random().toString(36).substr(2, 9);
      warn('localStorage not available, using temporary visitor ID');
    }
    
    debug('Session initialization started', {
      sessionId: sessionId,
      visitorId: visitorId,
      trackingId: trackingId,
      projectId: projectId,
      timestamp: Date.now()
    });
    
    // Capture performance data
    debug('Capturing performance data');
    capturePerformanceData();
    
    // Setup error tracking
    debug('Setting up error tracking');
    setupErrorTracking();
    
    // Start rrweb recording instead of DOM capture (only if enabled)
    if (config.sessionRecordingEnabled) {
      debug('Starting rrweb recording');
      startRRWebRecording();
    } else {
      console.log('🚫 [Session Recording] SKIPPED in initializeSession - Session recording is disabled');
      console.log('📊 [Session Recording] Flag value:', config.sessionRecordingEnabled);
    }
    
    // Setup event listeners
    debug('Setting up event listeners');
    setupEventListeners();
    
    debug('Setting up SPA navigation tracking');
    setupSPANavigation();
    
    // Track initial pageview
    debug('Tracking initial pageview');
    trackPageView();
    
    log('Session recording started with rrweb');
    debug('Session initialization completed', {
      sessionId: sessionId,
      performanceDataCaptured: !!performanceData,
      errorTrackingSetup: true,
      rrwebStarted: true,
      eventListenersSetup: true
    });
  }

  // Send final events on page unload
  window.addEventListener('beforeunload', function() {
    stopRRWebRecording();
    sendSessionReplayEvents();
    sendFinalEmotionState();
  });

  // ============================================
  // CONVERSION WIDGET SYSTEM
  // ============================================
  
  var widgetState = {
    loaded: false,
    widgets: [],
    activeWidget: null,
    shownWidgets: new Set(),
    timeOnPage: 0,
    maxScrollDepth: 0,
    exitIntentTriggered: false
  };

  // Detect device type
  function detectDevice() {
    var ua = navigator.userAgent.toLowerCase();
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }

  // Fetch widget configuration from backend
  function fetchWidgetConfig() {
    if (!trackingId || trackingId === 'your_tracking_id_here') {
      debug('Widget config fetch skipped: invalid tracking ID');
      return Promise.resolve([]);
    }

    var device = detectDevice();
    var referrer = document.referrer || '';
    var pagePath = window.location.pathname;

    return fetch(config.apiBaseUrl + '/get-widget-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        tracking_id: trackingId,
        page_path: pagePath,
        referrer: referrer,
        device: device
      })
    })
    .then(function(response) {
      if (!response.ok) throw new Error('Widget config fetch failed');
      return response.json();
    })
    .then(function(data) {
      debug('Widget config loaded:', data);
      return data.widgets || [];
    })
    .catch(function(error) {
      console.error('Error fetching widget config:', error);
      return [];
    });
  }

  // Track widget interaction
  function trackWidgetInteraction(widgetId, interactionType, interactionData) {
    if (!trackingId || !sessionId) return;

    var device = detectDevice();
    var country = 'Unknown'; // Could be enhanced with IP geolocation
    var pagePath = window.location.pathname;

    fetch(config.apiBaseUrl + '/track-widget-interaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        tracking_id: trackingId,
        widget_id: widgetId,
        session_id: sessionId,
        interaction_type: interactionType,
        page_path: pagePath,
        interaction_data: interactionData || {},
        user_agent: navigator.userAgent,
        device: device,
        country: country
      })
    })
    .then(function(response) {
      if (response.ok) {
        debug('Widget interaction tracked:', interactionType);
      }
    })
    .catch(function(error) {
      console.error('Error tracking widget interaction:', error);
    });
  }

  // Save form submission to database
  function saveFormSubmission(widgetId, email, name) {
    if (!trackingId || !projectId) return;

    fetch(config.apiBaseUrl + '/save-widget-submission', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        widget_id: widgetId,
        project_id: projectId,
        email: email,
        name: name || null,
        form_data: {}
      })
    })
    .then(function(response) {
      if (response.ok) {
        debug('Form submission saved');
      }
    })
    .catch(function(error) {
      console.error('Error saving form submission:', error);
    });
  }

  // ========================================
  // ADVANCED FEATURE HELPERS
  // ========================================
  
  // Check frequency control
  function checkFrequency(widget) {
    var frequencyType = widget.frequency_type || 'always';
    var widgetKey = 'widget_frequency_' + widget.id;
    
    switch (frequencyType) {
      case 'once_session':
        if (sessionStorage.getItem(widgetKey)) {
          return false; // Already shown this session
        }
        break;
        
      case 'once_day':
        var lastShown = localStorage.getItem(widgetKey);
        if (lastShown) {
          var daysSince = (Date.now() - parseInt(lastShown)) / (24 * 60 * 60 * 1000);
          if (daysSince < 1) return false;
        }
        break;
        
      case 'once_week':
        var lastShown = localStorage.getItem(widgetKey);
        if (lastShown) {
          var daysSince = (Date.now() - parseInt(lastShown)) / (24 * 60 * 60 * 1000);
          if (daysSince < 7) return false;
        }
        break;
        
      case 'max_views':
        var viewCount = parseInt(localStorage.getItem(widgetKey + '_count') || '0');
        var maxViews = widget.frequency_value || 999;
        if (viewCount >= maxViews) return false;
        break;
        
      case 'after_conversion':
        if (localStorage.getItem(widgetKey + '_converted')) {
          return false; // Already converted
        }
        break;
    }
    
    // Check cooldown
    if (widget.cooldown_days) {
      var lastShown = localStorage.getItem(widgetKey);
      if (lastShown) {
        var daysSince = (Date.now() - parseInt(lastShown)) / (24 * 60 * 60 * 1000);
        if (daysSince < widget.cooldown_days) return false;
      }
    }
    
    return true;
  }
  
  // Record widget impression
  function recordImpression(widget) {
    var widgetKey = 'widget_frequency_' + widget.id;
    var frequencyType = widget.frequency_type || 'always';
    
    // Store session flag
    sessionStorage.setItem(widgetKey, 'shown');
    
    // Store persistent flags
    if (frequencyType === 'once_day' || frequencyType === 'once_week' || widget.cooldown_days) {
      localStorage.setItem(widgetKey, Date.now().toString());
    }
    
    // Increment view count
    if (frequencyType === 'max_views') {
      var count = parseInt(localStorage.getItem(widgetKey + '_count') || '0');
      localStorage.setItem(widgetKey + '_count', (count + 1).toString());
    }
  }
  
  // Check advanced targeting
  function checkAdvancedTargeting(widget) {
    // Check visitor type
    if (widget.target_visitor_type && widget.target_visitor_type !== 'all') {
      var isNewVisitor = !localStorage.getItem('_is_returning_visitor');
      if (widget.target_visitor_type === 'new' && !isNewVisitor) return false;
      if (widget.target_visitor_type === 'returning' && isNewVisitor) return false;
    }
    
    // Check UTM parameters
    var urlParams = new URLSearchParams(window.location.search);
    if (widget.target_utm_source) {
      var utmSource = urlParams.get('utm_source');
      if (!utmSource || utmSource !== widget.target_utm_source) return false;
    }
    if (widget.target_utm_campaign) {
      var utmCampaign = urlParams.get('utm_campaign');
      if (!utmCampaign || utmCampaign !== widget.target_utm_campaign) return false;
    }
    
    // Check traffic source
    if (widget.target_traffic_source && widget.target_traffic_source !== 'all') {
      var referrer = document.referrer;
      var source = 'direct';
      
      if (referrer) {
        if (referrer.includes('google') || referrer.includes('bing')) source = 'organic';
        else if (referrer.includes('facebook') || referrer.includes('twitter') || referrer.includes('instagram')) source = 'social';
        else if (urlParams.get('utm_source')) source = 'paid';
        else source = 'referral';
      }
      
      if (source !== widget.target_traffic_source) return false;
    }
    
    return true;
  }
  
  // Check if widget triggers are met
  function checkWidgetTriggers(widget) {
    // Check frequency control first
    if (!checkFrequency(widget)) {
      debug('Widget blocked by frequency control:', widget.id);
      return false;
    }
    
    // Check advanced targeting
    if (!checkAdvancedTargeting(widget)) {
      debug('Widget blocked by targeting rules:', widget.id);
      return false;
    }
    
    if (!widget.widget_triggers || widget.widget_triggers.length === 0) {
      return true; // No triggers = always show
    }

    // Check if ALL triggers are met (AND logic)
    return widget.widget_triggers.every(function(trigger) {
      var config = trigger.trigger_config;

      switch (trigger.trigger_type) {
        case 'time_on_page':
          return widgetState.timeOnPage >= (config.seconds || 0);

        case 'scroll_depth':
          return widgetState.maxScrollDepth >= (config.percentage || 0);

        case 'exit_intent':
          return widgetState.exitIntentTriggered;

        case 'visit_count':
          var visits = parseInt(localStorage.getItem('_is_visit_count') || '0');
          return visits >= (config.count || 1);

        // Page match and device triggers are evaluated server-side
        case 'page_match':
        case 'referrer_match':
        case 'device':
          return true;

        default:
          return true;
      }
    });
  }

  // Find next widget to show
  function findNextWidget() {
    if (widgetState.widgets.length === 0) return null;

    // Find first widget that:
    // 1. Hasn't been shown yet
    // 2. Meets all trigger conditions
    // 3. Has highest priority
    for (var i = 0; i < widgetState.widgets.length; i++) {
      var widget = widgetState.widgets[i];
      if (!widgetState.shownWidgets.has(widget.id) && checkWidgetTriggers(widget)) {
        return widget;
      }
    }

    return null;
  }

  // Create widget pill HTML
  function createWidgetPill(widget) {
    var position = widget.pill_position || 'bottom-right';
    var positionStyles = {
      'bottom-right': 'bottom: 20px; right: 20px;',
      'bottom-left': 'bottom: 20px; left: 20px;',
      'top-right': 'top: 20px; right: 20px;',
      'top-left': 'top: 20px; left: 20px;'
    };

    var content = widget.content || {};
    var bgColor = content.background_color || '#667eea';
    var textColor = content.text_color || '#ffffff';
    
    // Use widget's entry animation for pill too
    var pillAnimation = getAnimationCSS(widget.animation_in, 'in');
    console.log('💊 Pill animation:', pillAnimation, 'from animation_in:', widget.animation_in);

    var pillHtml = '<div id="is-widget-pill" class="is-widget-pill" style="' +
      'position: fixed; ' +
      positionStyles[position] +
      'background: ' + bgColor + '; ' +
      'color: ' + textColor + '; ' +
      'padding: 12px 24px; ' +
      'border-radius: 50px; ' +
      'box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15); ' +
      'cursor: pointer; ' +
      'z-index: 999999; ' +
      'font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; ' +
      'font-size: 14px; ' +
      'font-weight: 600; ' +
      'display: flex; ' +
      'align-items: center; ' +
      'gap: 8px; ' +
      'transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); ' +
      'animation: ' + pillAnimation + ' 0.6s cubic-bezier(0.4, 0, 0.2, 1); ' +
      '">' +
      (widget.pill_icon || '✨') + ' ' +
      widget.pill_text +
      '</div>';

    return pillHtml;
  }

  // Get animation CSS name
  function getAnimationCSS(animationType, direction) {
    if (!animationType || animationType === 'none') return '';
    
    var animationMap = {
      'fade': direction === 'in' ? 'is-fade-in' : 'is-fade-out',
      'slide': direction === 'in' ? 'is-slide-in' : 'is-slide-out',
      'bounce': direction === 'in' ? 'is-bounce-in' : 'is-bounce-out',
      'zoom': direction === 'in' ? 'is-zoom-in' : 'is-zoom-out',
      'shake': direction === 'in' ? 'is-shake-in' : 'is-shake-in'
    };
    
    return animationMap[animationType] || 'is-fade-in';
  }
  
  // Get widget sizing
  function getWidgetSize(size) {
    var sizes = {
      'small': '320px',
      'medium': '400px',
      'large': '500px',
      'full': '800px'
    };
    return sizes[size] || '400px';
  }
  
  // Play sound effect
  function playSound(soundType, widget) {
    console.log('🔊 playSound called:', {
      enable_sound: widget.enable_sound,
      soundType: soundType,
      widget_sound_type: widget.sound_type,
      widget_sound_on_open: widget.sound_on_open,
      sound_volume: widget.sound_volume
    });
    
    if (!widget.enable_sound) {
      console.log('🔇 Sound disabled: enable_sound =', widget.enable_sound);
      return;
    }
    
    // Support both old (sound_on_open) and new (sound_type) column names
    var actualSoundType = soundType || widget.sound_type || widget.sound_on_open;
    if (!actualSoundType || actualSoundType === 'none') {
      console.log('🔇 No sound type specified or set to none');
      return;
    }
    
    console.log('🔊 Playing sound:', actualSoundType);
    
    try {
      // Use Web Audio API for better sound generation
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        console.log('🔇 Web Audio API not supported');
        return;
      }
      
      var audioContext = new AudioContext();
      var oscillator = audioContext.createOscillator();
      var gainNode = audioContext.createGain();
      
      // Configure sound based on type
      var soundConfig = {
        notification: { freq1: 800, freq2: 600, duration: 0.15 },
        ding: { freq1: 1000, duration: 0.2 },
        pop: { freq1: 600, duration: 0.1 },
        success: { freq1: 523, freq2: 659, duration: 0.2 },
        celebrate: { freq1: 659, freq2: 784, duration: 0.3 },
        chime: { freq1: 523, freq2: 784, duration: 0.25 }
      };
      
      var config = soundConfig[actualSoundType] || soundConfig.notification;
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Support both decimal (0.5) and integer (50) volume formats
      var volume = widget.sound_volume || 50;
      if (volume > 1) {
        volume = volume / 100; // Convert integer (0-100) to decimal (0-1)
      }
      gainNode.gain.setValueAtTime(volume / 2, audioContext.currentTime); // Divide by 2 for gentler volume
      
      // Set frequency
      oscillator.frequency.setValueAtTime(config.freq1, audioContext.currentTime);
      oscillator.type = 'sine';
      
      // Start playing
      oscillator.start(audioContext.currentTime);
      
      // Play second note if configured (for notification, success, etc.)
      if (config.freq2) {
        oscillator.frequency.setValueAtTime(config.freq2, audioContext.currentTime + config.duration / 2);
      }
      
      // Fade out at the end
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + config.duration);
      
      // Stop
      oscillator.stop(audioContext.currentTime + config.duration);
      
      console.log('✅ Sound played successfully:', actualSoundType);
    } catch (e) {
      console.error('❌ Sound error:', e);
    }
  }
  
  // Create widget panel HTML
  function createWidgetPanel(widget) {
    // DEBUG: Log widget config
    console.log('🎨 Creating widget panel with config:', {
      id: widget.id,
      size: widget.widget_size,
      animation_in: widget.animation_in,
      animation_out: widget.animation_out,
      has_countdown: widget.has_countdown,
      countdown_target: widget.countdown_target,
      show_social_proof: widget.show_social_proof,
      social_proof_count: widget.social_proof_count,
      layout_type: widget.layout_type
    });
    
    var position = widget.pill_position || 'bottom-right';
    var isRight = position.includes('right');
    var isBottom = position.includes('bottom');
    
    // Supported layout types: 'pill', 'modal', 'slide-in'
    // pill = Compact popup (respects widget size)
    // slide-in = Modal Side (medium, side position)
    // modal = Modal Center Large (large, center position)
    var layoutType = widget.layout_type || 'slide-in';
    
    // Backwards compatibility: Map deprecated types
    if (layoutType === 'bar' || layoutType === 'embedded') {
      layoutType = 'slide-in';
    }
    
    // Set widget size based on layout type
    var widgetSize;
    if (layoutType === 'modal') {
      // Modal Center - respects widget_size setting
      var size = widget.widget_size || 'large';
      console.log('📏 Modal widget_size from DB:', size);
      if (size === 'small') {
        widgetSize = '384px'; // max-w-sm
      } else if (size === 'medium') {
        widgetSize = '672px'; // max-w-2xl
      } else {
        // large - 90% width
        widgetSize = '90%';
      }
      console.log('📏 Calculated widgetSize:', widgetSize);
    } else if (layoutType === 'slide-in') {
      // Modal Side - always medium
      widgetSize = '420px';
    } else {
      // Pill - respects widget_size setting
      widgetSize = getWidgetSize(widget.widget_size);
    }
    
    var animationClass = getAnimationCSS(widget.animation_in, 'in');
    
    console.log('🎨 Widget styling:', {
      layoutType: layoutType,
      widgetSize: widgetSize,
      animationClass: animationClass
    });

    var positionStyles;
    
    // For modal layout, center it properly without using transform
    if (layoutType === 'modal') {
      positionStyles = 'left: 50%; top: 50%;';
    } else {
      // For pill and slide-in, position at edge (using pill_position)
      positionStyles = isRight ? 'right: 20px;' : 'left: 20px;';
      positionStyles += isBottom ? 'bottom: 20px;' : 'top: 20px;';
    }

    var content = widget.content || {};
    var bgColor = content.background_color || '#667eea';
    var textColor = content.text_color || '#ffffff';
    
    // Popup colors (for expanded panel)
    var popupBg = content.popup_background || '#ffffff';
    var popupTextColor = content.popup_text_color || '#1f2937';
    
    console.log('🎨 Popup colors:', {
      popup_background: popupBg,
      popup_text_color: popupTextColor
    });
    
    // Create header with pill icon (larger for modal center)
    var isLargeModal = (layoutType === 'modal');
    var headerHtml = '<div style="' +
      'display: flex; ' +
      'align-items: center; ' +
      (isLargeModal ? 'gap: 12px; ' : 'gap: 10px; ') +
      (isLargeModal ? 'padding-bottom: 16px; ' : 'padding-bottom: 12px; ') +
      (isLargeModal ? 'margin-bottom: 20px; ' : 'margin-bottom: 16px; ') +
      '">' +
      '<div style="' +
      (isLargeModal ? 'font-size: 36px; ' : 'font-size: 28px; ') +
      'line-height: 1; ' +
      '">' + (widget.pill_icon || '✨') + '</div>' +
      '<div style="flex: 1;">' +
      '<div style="' +
      (isLargeModal ? 'font-size: 20px; ' : 'font-size: 15px; ') +
      'font-weight: 700; ' +
      'color: ' + popupTextColor + '; ' +
      'margin-bottom: 2px; ' +
      '">' + (widget.pill_text || 'Special Offer') + '</div>' +
      '<div style="' +
      (isLargeModal ? 'font-size: 14px; ' : 'font-size: 11px; ') +
      'color: ' + popupTextColor + '; ' +
      'opacity: 0.6; ' +
      '">Limited time offer</div>' +
      '</div>' +
      '</div>';
    
    var contentHtml = generateWidgetContent(widget, content, layoutType, popupTextColor);

    // For modal center, use wrapper for positioning + inner for animation
    var panelHtml;
    if (layoutType === 'modal') {
      panelHtml = '<div id="is-widget-wrapper" style="position: fixed; ' + positionStyles + ' transform: translate(-50%, -50%); z-index: 999999;">' +
        '<div id="is-widget-panel" class="is-widget-panel" data-widget-id="' + widget.id + '" style="' +
        'background: ' + popupBg + '; ' +
        'color: ' + popupTextColor + '; ' +
        'border-radius: 18px; ' +
        'box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05); ' +
        'padding: 32px; ' +
        'max-width: ' + widgetSize + '; ' +
        'width: 90vw; ' +
        'font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; ' +
        'animation: ' + animationClass + ' 0.4s cubic-bezier(0.4, 0, 0.2, 1); ' +
        'transform-origin: center center; ' +
        'overflow: hidden; ' +
        '">';
    } else {
      panelHtml = '<div id="is-widget-panel" class="is-widget-panel" data-widget-id="' + widget.id + '" style="' +
        'position: fixed; ' +
        positionStyles +
        'background: ' + popupBg + '; ' +
        'color: ' + popupTextColor + '; ' +
        'border-radius: 18px; ' +
        'box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05); ' +
        (isLargeModal ? 'padding: 32px; ' : 'padding: 20px; ') +
        'max-width: ' + widgetSize + '; ' +
        'width: 90vw; ' +
        'z-index: 999999; ' +
        'font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; ' +
        'animation: ' + animationClass + ' 0.4s cubic-bezier(0.4, 0, 0.2, 1); ' +
        'transform-origin: ' + (isRight ? 'right' : 'left') + ' ' + (isBottom ? 'bottom' : 'top') + '; ' +
        'overflow: hidden; ' +
        '">';
    }
    
    // Add style for input placeholders
    panelHtml += '<style>' +
      '#is-widget-panel input::placeholder { color: ' + popupTextColor + '; opacity: 0.5; } ' +
      '#is-widget-panel input::-webkit-input-placeholder { color: ' + popupTextColor + '; opacity: 0.5; } ' +
      '#is-widget-panel input::-moz-placeholder { color: ' + popupTextColor + '; opacity: 0.5; } ' +
      '#is-widget-panel input:-ms-input-placeholder { color: ' + popupTextColor + '; opacity: 0.5; } ' +
      '</style>';
    
    panelHtml +=
      '<button id="is-widget-close" style="' +
      'position: absolute; ' +
      (isLargeModal ? 'top: 20px; ' : 'top: 16px; ') +
      (isLargeModal ? 'right: 20px; ' : 'right: 16px; ') +
      'background: transparent; ' +
      'border: none; ' +
      'padding: 0; ' +
      'margin: 0; ' +
      (isLargeModal ? 'width: 36px; ' : 'width: 32px; ') +
      (isLargeModal ? 'height: 36px; ' : 'height: 32px; ') +
      (isLargeModal ? 'min-width: 36px; ' : 'min-width: 32px; ') +
      (isLargeModal ? 'min-height: 36px; ' : 'min-height: 32px; ') +
      'border-radius: 50%; ' +
      (isLargeModal ? 'font-size: 20px; ' : 'font-size: 18px; ') +
      'color: #666; ' +
      'cursor: pointer; ' +
      'display: flex; ' +
      'align-items: center; ' +
      'justify-content: center; ' +
      'transition: all 0.2s; ' +
      'line-height: 1; ' +
      'flex-shrink: 0; ' +
      '" onmouseover="this.style.background=\'rgba(0, 0, 0, 0.1)\'" onmouseout="this.style.background=\'transparent\'">×</button>' +
      headerHtml +
      contentHtml +
      '</div>' +
      (layoutType === 'modal' ? '</div>' : ''); // Close wrapper for modal center
    
    // Add modal backdrop if needed
    if (layoutType === 'modal') {
      panelHtml = '<div id="is-widget-backdrop" style="' +
        'position: fixed; ' +
        'top: 0; left: 0; right: 0; bottom: 0; ' +
        'background: rgba(0, 0, 0, 0.5); ' +
        'z-index: 999998; ' +
        'animation: is-fade-in 0.3s; ' +
        '"></div>' + panelHtml;
    }

    return panelHtml;
  }

  // Create countdown timer HTML
  function createCountdownHTML(widget, content) {
    if (!widget.has_countdown) {
      console.log('⏰ Countdown disabled: has_countdown =', widget.has_countdown);
      return '';
    }
    
    // Support BOTH countdown types:
    // 1. Fixed date/time (countdown_target or countdown_end_date)
    // 2. Per-visitor duration (countdown_duration_seconds)
    
    var countdownTarget = widget.countdown_target || widget.countdown_end_date;
    var countdownDuration = widget.countdown_duration_seconds;
    
    var targetTime;
    
    if (countdownTarget) {
      // Fixed date/time countdown
      console.log('⏰ Using fixed countdown target:', countdownTarget);
      targetTime = new Date(countdownTarget).getTime();
    } else if (countdownDuration) {
      // Per-visitor duration countdown - calculate target time
      console.log('⏰ Using duration-based countdown:', countdownDuration, 'seconds');
      
      // Check if we already stored a target time for this widget in this session
      var storageKey = 'countdown_target_' + widget.id;
      var storedTarget = sessionStorage.getItem(storageKey);
      
      if (storedTarget) {
        targetTime = parseInt(storedTarget);
        console.log('⏰ Using stored target time:', new Date(targetTime));
      } else {
        // First time showing - calculate target time from now
        targetTime = Date.now() + (countdownDuration * 1000);
        sessionStorage.setItem(storageKey, targetTime.toString());
        console.log('⏰ Created new target time:', new Date(targetTime));
      }
    } else {
      console.log('⏰ No countdown configuration found:', {
        countdown_target: widget.countdown_target,
        countdown_end_date: widget.countdown_end_date,
        countdown_duration_seconds: widget.countdown_duration_seconds
      });
      return '';
    }
    
    var now = Date.now();
    var diff = Math.max(0, targetTime - now);
    
    if (diff === 0) {
      console.log('⏰ Countdown expired');
      return '';
    }
    
    var days = Math.floor(diff / (1000 * 60 * 60 * 24));
    var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    var seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    // Pad numbers with leading zeros
    var pad = function(num) { return num < 10 ? '0' + num : num; };
    
    // Use popup background with slight darkening, fallback to light gray
    var countdownBg = '#f9fafb'; // default
    if (content && content.popup_background) {
      // Create a slightly darker version of popup background
      var popupBg = content.popup_background;
      // Simple darkening by adding alpha black overlay effect via rgba
      countdownBg = popupBg;
    }
    
    return '<div id="is-countdown" style="' +
      'display: flex; gap: 6px; justify-content: center; align-items: center; margin: 12px 0; ' +
      'background: ' + countdownBg + '; padding: 10px; border-radius: 8px; opacity: 0.95; ' +
      '">' +
      (days > 0 ? '<div style="display: flex; align-items: baseline; gap: 4px;">' +
        '<span style="font-size: 20px; font-weight: bold; font-family: monospace;">' + pad(days) + '</span>' +
        '<span style="font-size: 11px; color: #666; font-weight: 500;">d</span>' +
        '</div><span style="color: #666;">:</span>' : '') +
      '<div style="display: flex; align-items: baseline; gap: 4px;">' +
        '<span style="font-size: 20px; font-weight: bold; font-family: monospace;">' + pad(hours) + '</span>' +
        '<span style="font-size: 11px; color: #666; font-weight: 500;">h</span>' +
      '</div><span style="color: #666;">:</span>' +
      '<div style="display: flex; align-items: baseline; gap: 4px;">' +
        '<span style="font-size: 20px; font-weight: bold; font-family: monospace;">' + pad(minutes) + '</span>' +
        '<span style="font-size: 11px; color: #666; font-weight: 500;">m</span>' +
      '</div><span style="color: #666;">:</span>' +
      '<div style="display: flex; align-items: baseline; gap: 4px;">' +
        '<span style="font-size: 20px; font-weight: bold; font-family: monospace;">' + pad(seconds) + '</span>' +
        '<span style="font-size: 11px; color: #666; font-weight: 500;">s</span>' +
      '</div>' +
      '</div>';
  }
  
  // Create social proof HTML
  function createSocialProofHTML(widget, currentCount) {
    if (!widget.show_social_proof) return '';
    
    var proofType = widget.social_proof_type || 'views';
    // Support both old (social_proof_number) and new (social_proof_count) column names
    var baseCount = parseInt(widget.social_proof_count || widget.social_proof_number) || 0;
    
    // Use current count if provided (for auto-increment), otherwise use base count
    var count = currentCount !== undefined ? currentCount : baseCount;
    
    if (count === 0 && proofType !== 'custom') return '';
    
    // Map database values to display values
    var typeMap = {
      'view_count': 'views',
      'purchase_count': 'purchases',
      'subscriber_count': 'signups'
    };
    proofType = typeMap[proofType] || proofType;
    
    var message = '';
    switch (proofType) {
      case 'views':
        message = '👁️ <strong>' + count + '</strong> people viewing right now';
        break;
      case 'purchases':
        message = '🛒 <strong>' + count + '</strong> purchased today';
        break;
      case 'signups':
        message = '✍️ <strong>' + count + '</strong> signed up today';
        break;
      case 'custom':
        message = widget.social_proof_message || '';
        break;
      default:
        message = '👁️ <strong>' + count + '</strong> people viewing';
    }
    
    if (!message) return '';
    
    return '<div id="is-social-proof" style="' +
      'color: #666; ' +
      'padding: 8px 12px; ' +
      'border-radius: 6px; ' +
      'font-size: 12px; ' +
      'text-align: center; ' +
      'margin-top: 12px; ' +
      '">' + message + '</div>';
  }
  
  // Generate content based on widget type
  function generateWidgetContent(widget, content, layoutType, popupTextColor) {
    var type = widget.widget_type;
    var bgColor = content.background_color || '#667eea';
    var textColor = content.text_color || '#ffffff';
    var isLargeModal = (layoutType === 'modal');
    
    // Use popup text color for content text, fallback to dark gray
    var contentTextColor = popupTextColor || '#1f2937';
    var contentSubtextColor = popupTextColor || '#666666';
    
    // Ensure these return empty strings, never undefined
    var countdownHTML = createCountdownHTML(widget, content) || '';
    var socialProofHTML = createSocialProofHTML(widget) || '';
    
    console.log('📝 Generated content elements:', {
      type: type,
      layoutType: layoutType,
      isLargeModal: isLargeModal,
      countdownHTML: countdownHTML.length > 0 ? 'YES (' + countdownHTML.length + ' chars)' : 'NO',
      socialProofHTML: socialProofHTML.length > 0 ? 'YES (' + socialProofHTML.length + ' chars)' : 'NO',
      bgColor: bgColor,
      textColor: textColor
    });
    
    switch (type) {
      case 'offer':
        return '<div>' +
          '<h2 style="margin: 0 0 ' + (isLargeModal ? '12px' : '8px') + ' 0; color: ' + contentTextColor + '; font-size: ' + (isLargeModal ? '28px' : '22px') + '; font-weight: 700; text-align: center;">' + (content.title || 'Special Offer!') + '</h2>' +
          '<p style="margin: 0 0 ' + (isLargeModal ? '18px' : '14px') + ' 0; color: ' + contentTextColor + '; opacity: 0.7; font-size: ' + (isLargeModal ? '16px' : '14px') + '; line-height: 1.5; text-align: center;">' + (content.description || 'Limited time offer') + '</p>' +
          countdownHTML +
          (content.promo_code ? '<div style="background: #f3f4f6; padding: ' + (isLargeModal ? '12px 16px' : '10px 12px') + '; border-radius: 8px; font-weight: 600; margin-bottom: ' + (isLargeModal ? '16px' : '12px') + '; font-size: ' + (isLargeModal ? '18px' : '16px') + '; letter-spacing: 0.5px; text-align: center;">' + content.promo_code + '</div>' : '') +
          '<a id="is-widget-cta-offer" href="' + (content.cta_url || '#') + '" target="_blank" style="' +
          'display: block; ' +
          'background: ' + bgColor + '; ' +
          'color: ' + textColor + '; ' +
          'border: none; ' +
          'padding: ' + (isLargeModal ? '16px 28px' : '14px 24px') + '; ' +
          'border-radius: 8px; ' +
          'font-weight: 600; ' +
          'cursor: pointer; ' +
          'width: 100%; ' +
          'box-sizing: border-box; ' +
          'font-size: ' + (isLargeModal ? '18px' : '16px') + '; ' +
          'text-decoration: none; ' +
          'text-align: center; ' +
          'transition: all 0.2s; ' +
          '">' + (content.cta_text || 'Claim Offer') + '</a>' +
          socialProofHTML +
          '</div>';

      case 'contact':
        var contactOptions = content.options || [];
        var contactHTML = contactOptions.map(function(option) {
          if (!option || !option.url || !option.label) return '';
          return '<a href="' + option.url + '" target="_blank" onclick="window.InsightStreamAnalytics.widgetContactClick(\'' + (option.type || 'other') + '\')" style="' +
          'display: flex; ' +
          'align-items: center; ' +
          'gap: 12px; ' +
          'padding: 14px; ' +
          'background: #f9fafb; ' +
          'border-radius: 8px; ' +
          'text-decoration: none; ' +
          'color: ' + contentTextColor + '; ' +
          'transition: all 0.2s; ' +
          '">' +
          '<span style="font-size: 20px;">' + (option.icon || '📞') + '</span>' +
          '<span style="font-weight: 500;">' + option.label + '</span>' +
          '</a>';
        }).join('');
        
        return '<div>' +
          '<h3 style="margin: 0 0 16px 0; color: ' + contentTextColor + '; font-size: 18px; text-align: center;">' + (content.title || 'Get in Touch') + '</h3>' +
          (contactHTML ? '<div style="display: flex; flex-direction: column; gap: 12px;">' + contactHTML + '</div>' : '<p style="text-align: center; color: ' + contentTextColor + '; opacity: 0.6;">No contact options available</p>') +
          '</div>';

      case 'action':
        return '<div>' +
          '<h2 style="margin: 0 0 8px 0; color: ' + contentTextColor + '; font-size: 22px; font-weight: 700; text-align: center;">' + (content.title || 'Take Action') + '</h2>' +
          '<p style="margin: 0 0 14px 0; color: ' + contentTextColor + '; opacity: 0.7; font-size: 14px; line-height: 1.5; text-align: center;">' + (content.description || '') + '</p>' +
          countdownHTML +
          '<a id="is-widget-cta-action" href="' + (content.cta_url || '#') + '" target="_blank" style="' +
          'display: block; ' +
          'background: ' + bgColor + '; ' +
          'color: ' + textColor + '; ' +
          'border: none; ' +
          'padding: 14px 24px; ' +
          'border-radius: 8px; ' +
          'font-weight: 600; ' +
          'cursor: pointer; ' +
          'width: 100%; ' +
          'box-sizing: border-box; ' +
          'font-size: 16px; ' +
          'text-decoration: none; ' +
          'text-align: center; ' +
          'transition: all 0.2s; ' +
          '">' + (content.cta_text || 'Get Started') + '</a>' +
          socialProofHTML +
          '</div>';

      case 'testimonial':
        return '<div>' +
          '<div style="text-align: center; margin-bottom: 16px;">' +
          '<div style="width: 60px; height: 60px; border-radius: 50%; background: #f3f4f6; margin: 0 auto 12px; overflow: hidden;">' +
          (content.avatar ? '<img src="' + content.avatar + '" style="width: 100%; height: 100%; object-fit: cover;" />' : '<div style="line-height: 60px; font-size: 24px;">👤</div>') +
          '</div>' +
          '<div style="font-size: 24px; color: #fbbf24; margin-bottom: 8px;">★★★★★</div>' +
          '</div>' +
          '<p style="margin: 0 0 12px 0; color: ' + contentTextColor + '; font-size: 15px; font-style: italic; text-align: center;">"' + (content.description || content.quote || 'Amazing service!') + '"</p>' +
          '<p style="margin: 0; color: ' + contentTextColor + '; opacity: 0.7; font-size: 14px; text-align: center;"><strong>' + (content.author_name || content.name || 'Customer') + '</strong>' +
          (content.author_title ? '<br/><span style="font-size: 12px;">' + content.author_title + '</span>' : '') + '</p>' +
          (content.cta_text ? '<a id="is-widget-cta-testimonial" href="' + (content.cta_url || '#') + '" target="_blank" style="' +
          'display: block; ' +
          'background: ' + bgColor + '; ' +
          'color: ' + textColor + '; ' +
          'border: none; ' +
          'padding: 14px 24px; ' +
          'border-radius: 8px; ' +
          'font-weight: 600; ' +
          'cursor: pointer; ' +
          'width: 100%; ' +
          'box-sizing: border-box; ' +
          'margin-top: 16px; ' +
          'font-size: 16px; ' +
          'text-decoration: none; ' +
          'text-align: center; ' +
          'transition: all 0.2s; ' +
          '">' + content.cta_text + '</a>' : '') +
          '</div>';

      case 'form':
        return '<div>' +
          '<h2 style="margin: 0 0 8px 0; color: ' + contentTextColor + '; font-size: 22px; font-weight: 700; text-align: center;">' + (content.title || 'Stay Updated') + '</h2>' +
          (content.description ? '<p style="margin: 0 0 14px 0; color: ' + contentTextColor + '; opacity: 0.7; font-size: 14px; line-height: 1.5; text-align: center;">' + content.description + '</p>' : '') +
          countdownHTML +
          '<form id="is-widget-form" style="display: flex; flex-direction: column; gap: 12px;">' +
          '<input id="is-widget-name" type="text" name="name" placeholder="' + (content.name_placeholder || 'Your name (optional)') + '" style="' +
          'padding: 12px; ' +
          'border: 1px solid ' + contentTextColor + '; ' +
          'border-opacity: 0.2; ' +
          'background: ' + contentTextColor + '10; ' +
          'color: ' + contentTextColor + '; ' +
          'border-radius: 8px; ' +
          'font-size: 14px; ' +
          'box-sizing: border-box; ' +
          '" />' +
          '<input id="is-widget-email" type="email" name="email" placeholder="' + (content.email_placeholder || 'Enter your email') + '" required style="' +
          'padding: 12px; ' +
          'border: 1px solid ' + contentTextColor + '; ' +
          'border-opacity: 0.2; ' +
          'background: ' + contentTextColor + '10; ' +
          'color: ' + contentTextColor + '; ' +
          'border-radius: 8px; ' +
          'font-size: 14px; ' +
          'box-sizing: border-box; ' +
          '" />' +
          '<button type="submit" style="' +
          'background: ' + bgColor + '; ' +
          'color: ' + textColor + '; ' +
          'border: none; ' +
          'padding: 14px 24px; ' +
          'border-radius: 8px; ' +
          'font-weight: 600; ' +
          'cursor: pointer; ' +
          'width: 100%; ' +
          'box-sizing: border-box; ' +
          'font-size: 16px; ' +
          'transition: all 0.2s; ' +
          '">' + (content.submit_text || 'Submit') + '</button>' +
          '</form>' +
          socialProofHTML +
          '</div>';

      default:
        return '<p>Unknown widget type</p>';
    }
  }

  // Show widget pill
  function showWidgetPill(widget) {
    if (widgetState.activeWidget) return; // Don't show if another widget is active

    console.log('💊 Showing widget pill for:', widget.id);

    var pillHtml = createWidgetPill(widget);
    var container = document.createElement('div');
    container.innerHTML = pillHtml;
    document.body.appendChild(container.firstChild);

    widgetState.activeWidget = widget;
    widgetState.shownWidgets.add(widget.id);

    // Play entrance sound when pill appears
    console.log('💊 Attempting to play sound...');
    playSound(widget.sound_type || widget.sound_on_open, widget);

    // Track view
    trackWidgetInteraction(widget.id, 'view', {});

    // Add click handler
    var pill = document.getElementById('is-widget-pill');
    if (pill) {
      pill.addEventListener('click', function() {
        expandWidget(widget);
      });

      // Hover effect
      pill.addEventListener('mouseenter', function() {
        pill.style.transform = 'scale(1.05)';
        pill.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.2)';
      });
      pill.addEventListener('mouseleave', function() {
        pill.style.transform = 'scale(1)';
        pill.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
      });
    }
  }

  // Expand widget to panel
  function expandWidget(widget) {
    var pill = document.getElementById('is-widget-pill');
    if (pill) {
      var exitAnimation = getAnimationCSS(widget.animation_out, 'out');
      pill.style.animation = exitAnimation + ' 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
      console.log('💊 Pill exit animation:', exitAnimation, 'from animation_out:', widget.animation_out);
      setTimeout(function() {
        pill.remove();
      }, 300);
    }

    // Track expand
    trackWidgetInteraction(widget.id, 'expand', {});
    
    // Record impression for frequency control
    recordImpression(widget);

    var panelHtml = createWidgetPanel(widget);
    var container = document.createElement('div');
    container.innerHTML = panelHtml;
    
    // Handle modal backdrop if present
    if (widget.layout_type === 'modal') {
      var backdrop = container.querySelector('#is-widget-backdrop');
      if (backdrop) {
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', function() {
          closeWidget(widget);
        });
      }
    }
    
    document.body.appendChild(container.firstChild);

    // Start countdown timer if enabled
    var countdownTarget = widget.countdown_target || widget.countdown_end_date;
    var countdownDuration = widget.countdown_duration_seconds;
    
    if (widget.has_countdown && (countdownTarget || countdownDuration)) {
      // Calculate target time (same logic as createCountdownHTML)
      var targetTime;
      
      if (countdownTarget) {
        targetTime = new Date(countdownTarget).getTime();
      } else if (countdownDuration) {
        var storageKey = 'countdown_target_' + widget.id;
        var storedTarget = sessionStorage.getItem(storageKey);
        targetTime = storedTarget ? parseInt(storedTarget) : (Date.now() + countdownDuration * 1000);
      }
      
      var countdownInterval = setInterval(function() {
        var countdownEl = document.getElementById('is-countdown');
        if (!countdownEl) {
          clearInterval(countdownInterval);
          return;
        }
        var now = Date.now();
        var diff = Math.max(0, targetTime - now);
        
        if (diff === 0) {
          clearInterval(countdownInterval);
          countdownEl.innerHTML = '<div style="color: #ef4444; font-weight: bold; text-align: center; padding: 12px;">⏰ OFFER EXPIRED</div>';
          return;
        }
        
        var days = Math.floor(diff / (1000 * 60 * 60 * 24));
        var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        var seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        // Pad numbers with leading zeros
        var pad = function(num) { return num < 10 ? '0' + num : num; };
        
        countdownEl.innerHTML = 
          (days > 0 ? '<div style="display: flex; align-items: baseline; gap: 4px;">' +
            '<span style="font-size: 20px; font-weight: bold; font-family: monospace;">' + pad(days) + '</span>' +
            '<span style="font-size: 11px; color: #666; font-weight: 500;">d</span>' +
            '</div><span style="color: #666;">:</span>' : '') +
          '<div style="display: flex; align-items: baseline; gap: 4px;">' +
            '<span style="font-size: 20px; font-weight: bold; font-family: monospace;">' + pad(hours) + '</span>' +
            '<span style="font-size: 11px; color: #666; font-weight: 500;">h</span>' +
          '</div><span style="color: #666;">:</span>' +
          '<div style="display: flex; align-items: baseline; gap: 4px;">' +
            '<span style="font-size: 20px; font-weight: bold; font-family: monospace;">' + pad(minutes) + '</span>' +
            '<span style="font-size: 11px; color: #666; font-weight: 500;">m</span>' +
          '</div><span style="color: #666;">:</span>' +
          '<div style="display: flex; align-items: baseline; gap: 4px;">' +
            '<span style="font-size: 20px; font-weight: bold; font-family: monospace;">' + pad(seconds) + '</span>' +
            '<span style="font-size: 11px; color: #666; font-weight: 500;">s</span>' +
          '</div>';
      }, 1000);
    }

    // Start social proof auto-increment if enabled
    if (widget.show_social_proof) {
      var baseCount = parseInt(widget.social_proof_count || widget.social_proof_number) || 0;
      var currentSocialCount = baseCount;
      var proofType = widget.social_proof_type || 'views';
      
      // Map database values to display values
      var typeMap = {
        'view_count': 'views',
        'purchase_count': 'purchases',
        'subscriber_count': 'signups'
      };
      proofType = typeMap[proofType] || proofType;
      
      // Auto-increment every 3-8 seconds (random for realism)
      var socialProofInterval = setInterval(function() {
        var socialProofEl = document.getElementById('is-social-proof');
        if (!socialProofEl) {
          clearInterval(socialProofInterval);
          return;
        }
        
        // Increment by 1-3 randomly
        var increment = Math.floor(Math.random() * 3) + 1;
        currentSocialCount += increment;
        
        // Update the display
        var message = '';
        switch (proofType) {
          case 'views':
            message = '👁️ <strong>' + currentSocialCount + '</strong> people viewing right now';
            break;
          case 'purchases':
            message = '🛒 <strong>' + currentSocialCount + '</strong> purchased today';
            break;
          case 'signups':
            message = '✍️ <strong>' + currentSocialCount + '</strong> signed up today';
            break;
          default:
            message = '👁️ <strong>' + currentSocialCount + '</strong> people viewing';
        }
        
        socialProofEl.innerHTML = message;
        
        // Add a subtle pulse animation
        socialProofEl.style.animation = 'none';
        setTimeout(function() {
          socialProofEl.style.animation = 'is-pulse 0.4s ease-out';
        }, 10);
        
      }, Math.floor(Math.random() * 5000) + 3000); // Random 3-8 seconds
    }

    // Add close handler
    var closeBtn = document.getElementById('is-widget-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        closeWidget(widget);
      });
    }

    // Add form submit handler
    var form = document.getElementById('is-widget-form');
    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var email = document.getElementById('is-widget-email').value;
        var name = document.getElementById('is-widget-name') ? document.getElementById('is-widget-name').value : '';
        
        // Save form submission
        saveFormSubmission(widget.id, email, name);
        
        // Track submit and mark as converted
        trackWidgetInteraction(widget.id, 'submit', { email: email });
        localStorage.setItem('widget_frequency_' + widget.id + '_converted', 'true');
        
        // Play success sound
        playSound('success', widget);
        
        // Show success message
        var formEl = e.target;
        formEl.innerHTML = '<div style="text-align: center; color: #10b981; padding: 20px;">' +
          '<div style="font-size: 48px; margin-bottom: 12px;">✓</div>' +
          '<div style="font-size: 18px; font-weight: 600;">Thanks for submitting!</div>' +
          '<div style="font-size: 14px; margin-top: 8px; color: #666;">We\'ll be in touch soon.</div>' +
          '</div>';
        
        // Close after delay
        setTimeout(function() {
          closeWidget(widget);
        }, 2000);
      });
    }

    // Add CTA button handlers (for non-form widgets)
    var ctaButtons = document.querySelectorAll('[id^="is-widget-cta-"]');
    ctaButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        trackWidgetInteraction(widget.id, 'click', {});
        
        // Mark as converted for CTA clicks
        localStorage.setItem('widget_frequency_' + widget.id + '_converted', 'true');
        
        closeWidget(widget);
      });
    });
  }

  // Close widget
  function closeWidget(widget) {
    var panel = document.getElementById('is-widget-panel');
    var wrapper = document.getElementById('is-widget-wrapper');
    var backdrop = document.getElementById('is-widget-backdrop');
    
    if (panel) {
      // Apply exit animation
      var exitAnimation = getAnimationCSS(widget ? widget.animation_out : 'fade', 'out');
      panel.style.animation = exitAnimation + ' 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
      
      setTimeout(function() {
        // Remove wrapper if it exists (modal center), otherwise remove panel
        if (wrapper) {
          wrapper.remove();
        } else {
          panel.remove();
        }
        if (backdrop) backdrop.remove();
        widgetState.activeWidget = null;
        
        // Show next widget after delay
        setTimeout(function() {
          checkAndShowWidget();
        }, 5000);
      }, 300);
    }

    // Track close
    if (widgetState.activeWidget) {
      trackWidgetInteraction(widgetState.activeWidget.id, 'close', {});
    }
  }

  // Check and show next widget
  function checkAndShowWidget() {
    if (widgetState.activeWidget) return;

    var widget = findNextWidget();
    if (widget) {
      // Check layout type to determine how to show widget
      var layoutType = widget.layout_type || 'pill';
      
      // Backwards compatibility: Map deprecated types to supported ones
      // Supported types: 'pill', 'modal', 'slide-in'
      // Deprecated types: 'bar', 'embedded' → treated as 'slide-in'
      if (layoutType === 'bar' || layoutType === 'embedded') {
        layoutType = 'slide-in';
      }
      
      console.log('🎯 Showing widget with layout type:', layoutType);
      
      // PILL layout: Show pill button first (2-step: pill → click → expand)
      if (layoutType === 'pill') {
        showWidgetPill(widget);
      } 
      // All other layouts: Skip pill, show full widget directly
      else {
        console.log('⚡ Skipping pill, showing full widget directly');
        widgetState.activeWidget = widget;
        widgetState.shownWidgets.add(widget.id);
        
        // Play entrance sound
        playSound(widget.sound_type || widget.sound_on_open, widget);
        
        // Track view
        trackWidgetInteraction(widget.id, 'view', {});
        
        // Record impression for frequency control
        recordImpression(widget);
        
        // Show full widget directly
        var panelHtml = createWidgetPanel(widget);
        var container = document.createElement('div');
        container.innerHTML = panelHtml;
        
        // Handle modal backdrop if present
        if (layoutType === 'modal') {
          var backdrop = container.querySelector('#is-widget-backdrop');
          if (backdrop) {
            document.body.appendChild(backdrop);
            backdrop.addEventListener('click', function() {
              closeWidget(widget);
            });
          }
        }
        
        document.body.appendChild(container.firstChild);
        
        // Start countdown timer if enabled
        var countdownTarget = widget.countdown_target || widget.countdown_end_date;
        var countdownDuration = widget.countdown_duration_seconds;
        
        if (widget.has_countdown && (countdownTarget || countdownDuration)) {
          // Calculate target time (same logic as createCountdownHTML)
          var targetTime;
          
          if (countdownTarget) {
            targetTime = new Date(countdownTarget).getTime();
          } else if (countdownDuration) {
            var storageKey = 'countdown_target_' + widget.id;
            var storedTarget = sessionStorage.getItem(storageKey);
            targetTime = storedTarget ? parseInt(storedTarget) : (Date.now() + countdownDuration * 1000);
          }
          
          var countdownInterval = setInterval(function() {
            var countdownEl = document.getElementById('is-countdown');
            if (!countdownEl) {
              clearInterval(countdownInterval);
              return;
            }
            var now = Date.now();
            var diff = Math.max(0, targetTime - now);
            
            if (diff === 0) {
              clearInterval(countdownInterval);
              countdownEl.innerHTML = '<div style="color: #ef4444; font-weight: bold; text-align: center; padding: 12px;">⏰ OFFER EXPIRED</div>';
              return;
            }
            
            var days = Math.floor(diff / (1000 * 60 * 60 * 24));
            var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            var seconds = Math.floor((diff % (1000 * 60)) / 1000);
            
            var pad = function(num) { return num < 10 ? '0' + num : num; };
            
            countdownEl.innerHTML = 
              (days > 0 ? '<div style="display: flex; align-items: baseline; gap: 4px;">' +
                '<span style="font-size: 20px; font-weight: bold; font-family: monospace;">' + pad(days) + '</span>' +
                '<span style="font-size: 11px; color: #666; font-weight: 500;">d</span>' +
                '</div><span style="color: #666;">:</span>' : '') +
              '<div style="display: flex; align-items: baseline; gap: 4px;">' +
                '<span style="font-size: 20px; font-weight: bold; font-family: monospace;">' + pad(hours) + '</span>' +
                '<span style="font-size: 11px; color: #666; font-weight: 500;">h</span>' +
              '</div><span style="color: #666;">:</span>' +
              '<div style="display: flex; align-items: baseline; gap: 4px;">' +
                '<span style="font-size: 20px; font-weight: bold; font-family: monospace;">' + pad(minutes) + '</span>' +
                '<span style="font-size: 11px; color: #666; font-weight: 500;">m</span>' +
              '</div><span style="color: #666;">:</span>' +
              '<div style="display: flex; align-items: baseline; gap: 4px;">' +
                '<span style="font-size: 20px; font-weight: bold; font-family: monospace;">' + pad(seconds) + '</span>' +
                '<span style="font-size: 11px; color: #666; font-weight: 500;">s</span>' +
              '</div>';
          }, 1000);
        }
        
        // Add close handler
        var closeBtn = document.getElementById('is-widget-close');
        if (closeBtn) {
          closeBtn.addEventListener('click', function() {
            closeWidget(widget);
          });
        }
        
        // Add form submit handler
        var form = document.getElementById('is-widget-form');
        if (form) {
          form.addEventListener('submit', function(e) {
            e.preventDefault();
            var email = document.getElementById('is-widget-email').value;
            var name = document.getElementById('is-widget-name') ? document.getElementById('is-widget-name').value : '';
            
            saveFormSubmission(widget.id, email, name);
            trackWidgetInteraction(widget.id, 'submit', { email: email });
            localStorage.setItem('widget_frequency_' + widget.id + '_converted', 'true');
            playSound('success', widget);
            
            var formEl = e.target;
            formEl.innerHTML = '<div style="text-align: center; color: #10b981; padding: 20px;">' +
              '<div style="font-size: 48px; margin-bottom: 12px;">✓</div>' +
              '<div style="font-size: 18px; font-weight: 600;">Thanks for submitting!</div>' +
              '<div style="font-size: 14px; margin-top: 8px; color: #666;">We\'ll be in touch soon.</div>' +
              '</div>';
            
            setTimeout(function() {
              closeWidget(widget);
            }, 2000);
          });
        }
        
        // Add CTA button handlers
        var ctaButtons = document.querySelectorAll('[id^="is-widget-cta-"]');
        ctaButtons.forEach(function(btn) {
          btn.addEventListener('click', function() {
            trackWidgetInteraction(widget.id, 'click', {});
            localStorage.setItem('widget_frequency_' + widget.id + '_converted', 'true');
            closeWidget(widget);
          });
        });
      }
    }
  }

  // Initialize widget system
  function initializeWidgets() {
    fetchWidgetConfig().then(function(widgets) {
      widgetState.widgets = widgets;
      widgetState.loaded = true;

      if (widgets.length > 0) {
        debug('Widgets loaded:', widgets.length);
        checkAndShowWidget();
      }
    });

    // Track time on page
    setInterval(function() {
      widgetState.timeOnPage++;
      checkAndShowWidget();
    }, 1000);

    // Track scroll depth
    window.addEventListener('scroll', function() {
      var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      var scrollPercent = (scrollTop / docHeight) * 100;
      
      if (scrollPercent > widgetState.maxScrollDepth) {
        widgetState.maxScrollDepth = scrollPercent;
        checkAndShowWidget();
      }
    });

    // Track exit intent
    document.addEventListener('mouseleave', function(e) {
      if (e.clientY < 0 && !widgetState.exitIntentTriggered) {
        widgetState.exitIntentTriggered = true;
        checkAndShowWidget();
      }
    });

    // Increment visit count
    var visits = parseInt(localStorage.getItem('_is_visit_count') || '0');
    localStorage.setItem('_is_visit_count', (visits + 1).toString());
  }

  // Add CSS animations
  var style = document.createElement('style');
  style.textContent = 
    // Pill animations
    '@keyframes is-pill-enter { from { opacity: 0; transform: translateY(20px) scale(0.9); } to { opacity: 1; transform: translateY(0) scale(1); } } ' +
    '@keyframes is-pill-exit { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.8); } } ' +
    
    // Fade animations
    '@keyframes is-fade-in { from { opacity: 0; } to { opacity: 1; } } ' +
    '@keyframes is-fade-out { from { opacity: 1; } to { opacity: 0; } } ' +
    
    // Slide animations
    '@keyframes is-slide-in { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } } ' +
    '@keyframes is-slide-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100%); } } ' +
    
    // Bounce animations
    '@keyframes is-bounce-in { ' +
      '0% { opacity: 0; transform: scale(0.3); } ' +
      '50% { opacity: 1; transform: scale(1.05); } ' +
      '70% { transform: scale(0.9); } ' +
      '100% { transform: scale(1); } ' +
    '} ' +
    '@keyframes is-bounce-out { ' +
      '0% { transform: scale(1); } ' +
      '50% { transform: scale(1.1); } ' +
      '100% { opacity: 0; transform: scale(0.3); } ' +
    '} ' +
    
    // Zoom animations
    '@keyframes is-zoom-in { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } } ' +
    '@keyframes is-zoom-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.5); } } ' +
    
    // Shake animation (entry only)
    '@keyframes is-shake-in { ' +
      '0%, 100% { transform: translateX(0); } ' +
      '10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); } ' +
      '20%, 40%, 60%, 80% { transform: translateX(10px); } ' +
    '} ' +
    
    // Legacy panel animations (backwards compatibility)
    '@keyframes is-panel-enter { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } } ' +
    '@keyframes is-panel-exit { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } } ' +
    
    // Pulse animation for social proof updates
    '@keyframes is-pulse { ' +
      '0% { transform: scale(1); } ' +
      '50% { transform: scale(1.05); } ' +
      '100% { transform: scale(1); } ' +
    '}';
  document.head.appendChild(style);

  // Public API
  window.InsightStreamAnalytics = {
    track: trackCustomEvent,
    trackPageView: trackPageView,
    getSessionId: function() { return sessionId; },
    getConfig: function() { return config; },
    setConfig: function(newConfig) { 
      Object.assign(config, newConfig); 
    },
    // Widget API
    widgetAction: function(url) {
      if (widgetState.activeWidget) {
        trackWidgetInteraction(widgetState.activeWidget.id, 'cta_click', { url: url });
      }
      if (url && url !== '#') {
        window.location.href = url;
      }
      closeWidget(widgetState.activeWidget);
    },
    widgetContactClick: function(type) {
      if (widgetState.activeWidget) {
        trackWidgetInteraction(widgetState.activeWidget.id, 'cta_click', { contact_type: type });
      }
    },
    widgetFormSubmit: function(event) {
      event.preventDefault();
      var form = event.target;
      var formData = new FormData(form);
      var data = {};
      formData.forEach(function(value, key) {
        data[key] = value;
      });

      if (widgetState.activeWidget) {
        trackWidgetInteraction(widgetState.activeWidget.id, 'submit', data);
      }

      // Show success message
      form.innerHTML = '<div style="text-align: center; padding: 20px;">' +
        '<div style="font-size: 48px; margin-bottom: 12px;">✅</div>' +
        '<p style="margin: 0; color: #1a1a1a; font-weight: 600;">Thank you!</p>' +
        '<p style="margin: 8px 0 0 0; color: #666; font-size: 14px;">We\'ll be in touch soon.</p>' +
        '</div>';

      setTimeout(function() {
        closeWidget(widgetState.activeWidget);
      }, 2000);
    }
  };

  // Initialize
  function initialize() {
    debug('Analytics tracker initialization started', {
      documentReadyState: document.readyState,
      windowAnalyticsConfig: !!window.analyticsConfig,
      windowTrackingId: !!window.__TRACKING_ID__,
      windowProjectId: !!window.__PROJECT_ID__
    });
    
    // Get tracking configuration now that the page is loaded
    trackingId = window.analyticsConfig?.trackingId || window.__TRACKING_ID__ || 'your_tracking_id_here';
    projectId = window.analyticsConfig?.projectId || window.__PROJECT_ID__ || 'your_project_id_here';
    
    debug('Configuration loaded', {
      trackingId: trackingId,
      projectId: projectId,
      debugMode: config.debugMode
    });
    
    log('Insight Stream Analytics Tracker v4.0.0 - Advanced Widget Features loaded');
    log('Tracking ID:', trackingId);
    log('Project ID:', projectId);
    
    // Check database to see if session recording is enabled
    console.log('🔍 [Session Recording] Checking database status...');
    console.log('📊 [Session Recording] Project ID:', projectId);
    console.log('📊 [Session Recording] Tracking ID:', trackingId);
    
    checkSessionRecordingEnabled().then(function(enabled) {
      config.sessionRecordingEnabled = enabled;
      
      // ALWAYS show the flag value prominently
      console.log('🎯 [Session Recording] DATABASE FLAG VALUE:', enabled);
      console.log('🎯 [Session Recording] config.sessionRecordingEnabled:', config.sessionRecordingEnabled);
      
      if (config.sessionRecordingEnabled) {
        console.log('✅ [Session Recording] ENABLED - Will start rrweb recording');
        debug('Session recording enabled, initializing session');
        initializeSession();
      } else {
        console.log('⛔ [Session Recording] DISABLED - Will NOT start rrweb recording');
        console.log('💡 [Session Recording] Enable recording in the Users tab of the admin panel');
        debug('Session recording disabled, skipping session initialization');
        // Still track pageviews even if recording is disabled
        sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        trackPageView();
      }
      
      log('Analytics tracking initialized');
      debug('Analytics tracker initialization completed');
      
      // Initialize widget system after analytics
      setTimeout(function() {
        initializeWidgets();
      }, 1000);
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
