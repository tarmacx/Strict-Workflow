/*
  Constants
*/
var PREFS = loadPrefs();

var BADGE_BACKGROUND_COLORS = {
    work: [192, 0, 0, 255],
    break: [0, 192, 0, 255],
    longbreak: [0, 192, 0, 255]

};

var RING = new Audio("ring.ogg");
var ringLoaded = false;
loadRingIfNecessary();

var ICONS = {
        ACTION: {},
        FULL: {},
    },
    iconTypeS = ['default', 'work', 'work_pending', 'break', 'break_pending', 'longbreak', 'longbreak_pending'],
    iconType;

//Load icons
for (var i in iconTypeS) {
    iconType = iconTypeS[i];
    ICONS.ACTION[iconType] = "icons/" + iconType + ".png";
    ICONS.FULL[iconType] = "icons/" + iconType + "_full.png";
}

//Main pomodoro declaration and execution
var mainPomodoro = new Pomodoro();

function defaultPrefs() {
    return {
        siteBlacklist: [
            'facebook.com',
            'youtube.com',
            'twitter.com',
            'tumblr.com',
            'pinterest.com',
            'myspace.com',
            'livejournal.com',
            'digg.com',
            'stumbleupon.com',
            'reddit.com',
            'kongregate.com',
            'newgrounds.com',
            'addictinggames.com',
            'hulu.com'
        ],
        siteWhitelist: [],
        durations: { // in seconds
            work: 25 * 60,
            break: 5 * 60
        },
        shouldRing: true,
        clickRestarts: false,
        clickSkipBreak: false,
        autostartWork: false,
        autostartBreak: true,
        whitelist: false
    }
}

function loadPrefs() {
    if (typeof localStorage['prefs'] !== 'undefined') {
        return updatePrefsFormat(JSON.parse(localStorage['prefs']));
    } else {
        return savePrefs(defaultPrefs());
    }
}

function updatePrefsFormat(prefs) {
    // Sometimes we need to change the format of the PREFS module. When just,
    // say, adding boolean flags with false as the default, there's no
    // compatibility issue. However, in more complicated situations, we need
    // to modify an old PREFS module's structure for compatibility.

    //TODO: Should be replaced with version ID to avoid cheap tricks to detect version change
    if (prefs.hasOwnProperty('siteList')) {
        // Upon adding a separate blacklist and whitelist, the siteList property
        // is renamed to either siteBlacklist or siteWhitelist.

        if (prefs.whitelist) {
            prefs.siteBlacklist = defaultPrefs().siteBlacklist;
            prefs.siteWhitelist = prefs.siteList;
        } else {
            prefs.siteBlacklist = prefs.siteList;
            prefs.siteWhitelist = defaultPrefs().siteWhitelist;
        }
        delete prefs.siteList;
        savePrefs(prefs);
        console.log("Renamed PREFS.siteList to PREFS.siteBlacklist/siteWhitelist");
    }

    if (!prefs.hasOwnProperty('showNotifications')) {
        // Upon adding the option to disable notifications, added the
        // showNotifications property, which defaults to true.
        prefs.showNotifications = true;
        savePrefs(prefs);
        console.log("Added PREFS.showNotifications");
    }

    return prefs;
}

//Save prefs to local storage
function savePrefs(prefs) {
    localStorage['prefs'] = JSON.stringify(prefs);
    return prefs;
}

//Set PREFS to currently edited prefs and save them
function setPrefs(prefs) {
    PREFS = savePrefs(prefs);
    loadRingIfNecessary();
    setTimeslotsAlarms();
    return prefs;
}

//Load ring audio only if required
function loadRingIfNecessary() {
    if (PREFS.shouldRing && !ringLoaded) {
        RING.onload = function () {
            console.log('ring loaded');
            ringLoaded = true;
        }
        RING.load();
    }
}

/*
  Models
*/
function Pomodoro() {
    this.timeRemaining = 0;
    this.workCyclesDone = 0;
    tickInterval = 0;
    //this.currentMode = 'work_pending';
}

Pomodoro.prototype.getDurations = function () {
    return PREFS.durations;
}

//Return the string of the remaining time (m or s)
Pomodoro.prototype.timeRemainingString = function () {
    if (this.timeRemaining >= 60) {
        return Math.round(this.timeRemaining / 60) + "m";
    } else {
        return (this.timeRemaining % 60) + "s";
    }
}

Pomodoro.prototype.start = function () {
    console.log("Start Pomodoro");
    this.nextMode();
    updateIcon(this.currentMode);
    this.updateBadge();

    //No idea what it does !
    //for (var key in options.timer) {
    //    timerOptions[key] = options.timer[key];
    //}

    this.currentModeDuration = this.getDurations()[this.currentMode];
    this.timeRemaining = this.currentModeDuration;

    //Start intervals here!
    tickInterval = setInterval(onTick, 1000);
    this.tick();

    //If it's a work cycle we block, break and long break unblocks
    if (this.currentMode == 'work') {
        executeInAllBlockedTabs('block');
    } else {
        executeInAllBlockedTabs('unblock');
    }

    //Fetch option tab
    var tabViews = chrome.extension.getViews({
            type: 'tab'
        }),
        tab;

    //
    for (var i in tabViews) {
        tab = tabViews[i];
        if (typeof tab.startCallbacks !== 'undefined') {
            tab.startCallbacks[this.currentMode]();
        }
    }
    //END Instanciation


}

Pomodoro.prototype.getNextMode = function () {
    switch (this.currentMode) {
        case 'work':
            if (PREFS.longbreaksEnabled) {
                if (this.workCyclesDone >= PREFS.cyclesBeforeLongBreak) {
                    return 'longbreak_pending';
                } else {
                    return 'break_pending';
                }
            } else {
                return 'break_pending';
            }
            break;
        case 'work_pending':
            return 'work';
            break;
        case 'break':
            return 'work_pending';
            break;
        case 'break_pending':
            return 'break';
            break;
        case 'longbreak':
            return 'work_pending';
            break;
        case 'longbreak_pending':
            return 'longbreak';
            break;
        default:
            //safety net, should not happen !
            return 'work_pending';
    }
}

Pomodoro.prototype.nextMode = function () {
    this.currentMode = this.getNextMode();
    if (this.currentMode == 'longbreak_pending') {
        this.workCyclesDone = 0;
    }
}

//Special stop function
Pomodoro.prototype.stop = function () {
    console.log("Stop Pomodoro");
    this.currentModeDuration = 0;
    this.timeRemaining = 0;
    this.currentMode = 'work_pending';
    //Avoid an error in case of stop without a start first
    if (tickInterval != 0) {
        clearInterval(tickInterval);
        tickInterval = 0;
    }
    updateIcon(this.currentMode);
    this.updateBadge();
    executeInAllBlockedTabs('unblock');
}

Pomodoro.prototype.restart = function () {
    this.timeRemaining = this.currentModeDuration;
}

Pomodoro.prototype.updateBadge = function () {
    switch (this.currentMode) {
        case 'work':
        case 'break':
        case 'longbreak':
            chrome.browserAction.setBadgeText({
                text: this.timeRemainingString()
            });
            break;
        default:
            chrome.browserAction.setBadgeText({
                text: ''
            });
    }
}

Pomodoro.prototype.tick = function () {
    this.timeRemaining--;
    this.updateBadge();
    if (this.timeRemaining <= 0) {
        this.onEnd();
    }
}

Pomodoro.prototype.onEnd = function () {

    this.currentModeDuration = 0;
    this.timeRemaining = 0;
    clearInterval(tickInterval);
    tickInterval = 0;


    if (this.currentMode == 'work') {
        this.workCyclesDone++;
    }

    //Set next mode (will be pending)
    var prevMode = this.currentMode;
    this.nextMode();
    var nextMode = this.getNextMode();

    //Set next icon in pending mode
    updateIcon(this.currentMode);
    this.updateBadge();

    //Diplays end of timer notification
    if (PREFS.showNotifications) {
        var nextModeName = chrome.i18n.getMessage(nextMode);
        chrome.notifications.create("", {
            type: "basic",
            title: chrome.i18n.getMessage("timer_end_notification_header"),
            message: chrome.i18n.getMessage("timer_end_notification_body",
                nextModeName),
            priority: 2,
            iconUrl: ICONS.FULL[this.getNextMode()]
        }, function () {});
    }

    if (PREFS.shouldRing) {
        console.log("playing ring", RING);
        RING.play();
    }

    if ((this.currentMode == 'break_pending' || this.currentMode == 'longbreak_pending') && PREFS.autostartBreak) {
        this.start();
    }

    if (this.currentMode == 'work_pending' && PREFS.autostartWork) {
        this.start();
    }
}

// Views

// The code gets really cluttered down here. Refactor would be in order,
// but I'm busier with other projects >_<

//Execute the domainsMatch and pathsMatch function against the listedPattern
function locationsMatch(location, listedPattern) {
    return domainsMatch(location.domain, listedPattern.domain) &&
        pathsMatch(location.path, listedPattern.path);
}

//Split full URL between domain and path
function parseLocation(location) {
    var components = location.split('/');
    return {
        domain: components.shift(),
        path: components.join('/')
    };
}

//Searching for specific path mathing see below for pattern
function pathsMatch(test, against) {
    /*
      index.php ~> [null]: pass
      index.php ~> index: pass
      index.php ~> index.php: pass
      index.php ~> index.phpa: fail
      /path/to/location ~> /path/to: pass
      /path/to ~> /path/to: pass
      /path/to/ ~> /path/to/location: fail
    */

    return !against || test.substr(0, against.length) == against;
}

function domainsMatch(test, against) {
    /*
      google.com ~> google.com: case 1, pass
      www.google.com ~> google.com: case 3, pass
      google.com ~> www.google.com: case 2, fail
      google.com ~> yahoo.com: case 3, fail
      yahoo.com ~> google.com: case 2, fail
      bit.ly ~> goo.gl: case 2, fail
      mail.com ~> gmail.com: case 2, fail
      gmail.com ~> mail.com: case 3, fail
    */

    // Case 1: if the two strings match, pass
    if (test === against) {
        return true;
    } else {
        var testFrom = test.length - against.length - 1;

        // Case 2: if the second string is longer than first, or they are the same
        // length and do not match (as indicated by case 1 failing), fail
        if (testFrom < 0) {
            return false;
        } else {
            // Case 3: if and only if the first string is longer than the second and
            // the first string ends with a period followed by the second string,
            // pass
            return test.substr(testFrom) === '.' + against;
        }
    }
}

function isLocationBlocked(location) {
    //define siteList depending on the block/allow mode as defined by whitelist
    var siteList = PREFS.whitelist ? PREFS.siteWhitelist : PREFS.siteBlacklist;

    //go through list to match the current site to the respective list
    for (var k in siteList) {
        listedPattern = parseLocation(siteList[k]);
        if (locationsMatch(location, listedPattern)) {
            // If we're in a whitelist, a matched location is not blocked => false
            // If we're in a blacklist, a matched location is blocked => true
            return !PREFS.whitelist;
        }
    }

    // If we're in a whitelist, an unmatched location is blocked => true
    // If we're in a blacklist, an unmatched location is not blocked => false
    return PREFS.whitelist;
}

function executeInTabIfBlocked(action, tab) {
    var file = "content_scripts/" + action + ".js",
        location;
    location = tab.url.split('://');
    location = parseLocation(location[1]);

    //Check tab to see if it needs to be blocked
    if (isLocationBlocked(location)) {
        chrome.tabs.executeScript(tab.id, {
            file: file
        });
    }
}

//This function list all windows and execute executeInTabIfBlocked for each tabs of each windows found
function executeInAllBlockedTabs(action) {
    var windows = chrome.windows.getAll({
        populate: true
    }, function (windows) {
        var tabs, tab, domain, listedDomain;
        for (var i in windows) {
            tabs = windows[i].tabs;
            for (var j in tabs) {
                executeInTabIfBlocked(action, tabs[j]);
            }
        }
    });
}

//This function add the current domain to the block list
function blockDomain() {
    chrome.tabs.query({
        'active': true,
        'lastFocusedWindow': true
    }, function (tabs) {
        var url = tabs[0].url;
        var parsedURL = parseURL(url);
        PREFS.siteBlacklist.push(parsedURL.parent_domain);
        savePrefs(PREFS);
    });
}

//This function add the current domain to the allow list
function allowDomain() {
    chrome.tabs.query({
        'active': true,
        'lastFocusedWindow': true
    }, function (tabs) {
        var url = tabs[0].url;
        var parsedURL = parseURL(url);
        PREFS.siteWhitelist.push(parsedURL.parent_domain);
        savePrefs(PREFS);
    });
}

//Function to parse the full URL and extract various informations (subdomain, host, tld)
function parseURL(url) {
    parsed_url = {}

    if (url == null || url.length == 0)
        return parsed_url;

    protocol_i = url.indexOf('://');
    parsed_url.protocol = url.substr(0, protocol_i);

    remaining_url = url.substr(protocol_i + 3, url.length);
    domain_i = remaining_url.indexOf('/');
    domain_i = domain_i == -1 ? remaining_url.length - 1 : domain_i;
    parsed_url.domain = remaining_url.substr(0, domain_i);
    parsed_url.path = domain_i == -1 || domain_i + 1 == remaining_url.length ? null : remaining_url.substr(domain_i + 1, remaining_url.length);

    //a domain can have multiple configuration (google.com, www.google.com, plus.google.com...), this sorts it out for the parsed url
    domain_parts = parsed_url.domain.split('.');
    switch (domain_parts.length) {
        case 2:
            parsed_url.subdomain = null;
            parsed_url.host = domain_parts[0];
            parsed_url.tld = domain_parts[1];
            break;
        case 3:
            parsed_url.subdomain = domain_parts[0];
            parsed_url.host = domain_parts[1];
            parsed_url.tld = domain_parts[2];
            break;
        case 4:
            parsed_url.subdomain = domain_parts[0];
            parsed_url.host = domain_parts[1];
            parsed_url.tld = domain_parts[2] + '.' + domain_parts[3];
            break;
    }

    parsed_url.parent_domain = parsed_url.host + '.' + parsed_url.tld;

    return parsed_url;
}

function updateIcon(mode) {
    //Updates Icon
    chrome.browserAction.setIcon({
        path: ICONS.ACTION[mode]
    });

    //Updates badge background
    if (mode == 'work' || mode == 'break' || mode == 'longbreak') {
        chrome.browserAction.setBadgeBackgroundColor({
            color: BADGE_BACKGROUND_COLORS[mode]
        });
    }

}

function onTick() {
    mainPomodoro.tick();
}

function setTimeslotsAlarms() {
    chrome.alarms.clearAll(function () {
        var now = new Date(Date.now());

        for (i in PREFS.timeslots) {
            timeToStart = getTimeslotDate(PREFS.timeslots[i].startTime);
            timeToStop = getTimeslotDate(PREFS.timeslots[i].stopTime);

            //Shift 1 day if it's a past item
            if (timeToStart <= now) {
                timeToStart.setDate(timeToStart.getDate() + 1);
            }
            if (timeToStop <= now) {
                timeToStop.setDate(timeToStop.getDate() + 1);
            }

            chrome.alarms.create(i + ";" + "start", {
                when: timeToStart.getTime(),
                periodInMinutes: 1440
            });
            chrome.alarms.create(i + ";" + "stop", {
                when: timeToStop.getTime(),
                periodInMinutes: 1440
            });
        }

        //Debug
        console.log("Alarms defined:");
        chrome.alarms.getAll(function (alarms) {
            for (i = 0; i < alarms.length; i++) {
                console.log("Scheduled Time  " + alarms[i].scheduledTime);
                console.log("Alarm Name " + alarms[i].name);
            }
        });
    });
}

function alarmEvent(alarm) {
    timeslotIndex = alarm.name.split(";")[0];
    timeslotAction = alarm.name.split(";")[1];

    console.log(Date.now().toDateString() + " - Alarm Event : " + timeslotIndex + " -> " + timeslotAction);

    var now = new Date(Date.now());
    var dd = now.getDay();

    timeToStart = getTimeslotDate(PREFS.timeslots[timeslotIndex].startTime);
    timeToStop = getTimeslotDate(PREFS.timeslots[timeslotIndex].stopTime);

    var alarmEnabled;
    //Check if stop time is next day we need to check if previous day was enabled
    if (timeToStop <= timeToStart && now.getHours >= 0){
        if (dd > 0) {
            alarmEnabled = PREFS.timeslots[timeslotIndex].daysEnabled[dd - 1];
        } else {
            alarmEnabled = PREFS.timeslots[timeslotIndex].daysEnabled[6]; //Check saturday instead
        }
    }else{
        alarmEnabled = PREFS.timeslots[timeslotIndex].daysEnabled[dd];
    }

    //Start of break timeslot
    if (timeslotAction == "start" && PREFS.operationMode == "modeTimeExclusion" && alarmEnabled) {
        mainPomodoro.stop();
    }
    //End of break timeslot
    if (timeslotAction == "stop" && PREFS.operationMode == "modeTimeExclusion" && alarmEnabled) {
        mainPomodoro.currentMode = "work_pending";
        mainPomodoro.start();
    }
    //Start of work timeslot
    if (timeslotAction == "start" && PREFS.operationMode == "modeTimeInclusion" && alarmEnabled) {
        mainPomodoro.currentMode = "work_pending";
        mainPomodoro.start();
    }
    //End of work timeslot
    if (timeslotAction == "stop" && PREFS.operationMode == "modeTimeInclusion" && alarmEnabled) {
        mainPomodoro.stop();
    }

    //Ring to note end of cycle
    if (PREFS.shouldRing) {
        console.log("playing ring", RING);
        RING.play();
    }

    //Diplays end of timer notification
    if (PREFS.showNotifications) {
        var nextModeName = chrome.i18n.getMessage(mainPomodoro.getNextMode());
        chrome.notifications.create("", {
            type: "basic",
            title: chrome.i18n.getMessage("timer_end_notification_header"),
            message: chrome.i18n.getMessage("timer_end_notification_body",
                nextModeName),
            priority: 2,
            iconUrl: ICONS.FULL[mainPomodoro.getNextMode()]
        }, function () {});
    }

}

function checkStartingMode() {
    now = new Date(Date.now());
    var curTimeslot;
    var timeslotDate = new Date();
    var dd = now.getDay();

    var foundTimeslot = false;

    for (i in PREFS.timeslots) {
        curTimeslot = PREFS.timeslots[i];
        timeslotDate = Date.now();

        var timeToStart = getTimeslotDate(curTimeslot.startTime);
        var timeToStop = getTimeslotDate(curTimeslot.stopTime);

        //Skip to next day if stop is earlier
        if (timeToStop < timeToStart) {
            timeToStop.setDate(time.getDate() + 1);
        }

        //Check if stop time is next day we need to check if previous day was enabled
        if (timeToStop <= timeToStart && now.getHours >= 0){
            if (dd > 0) {
                timeslotEnabled = curTimeslot.daysEnabled[dd - 1];
            } else {
                timeslotEnabled = curTimeslot.daysEnabled[6]; //Check saturday instead
            }
        }else{
            timeslotEnabled = curTimeslot.daysEnabled[dd];
        }

        //Check if in timeslot
        if (now > timeToStart && now < timeToStop && timeslotEnabled) {
            foundTimeslot = true;

            //Start of work timeslot
            if (PREFS.operationMode == "modeTimeInclusion" && timeslotEnabled) {
                mainPomodoro.currentMode = "work_pending";
                mainPomodoro.start();
            }
        }
    }

    if(!foundTimeslot && PREFS.operationMode == "modeTimeExclusion"){
        mainPomodoro.start();
    }
}

function getTimeslotDate(timeAsString) {
    var now = new Date(Date.now());
    var timeslotDate = new Date(Date.now());

    var startHours = timeAsString.split(":")[0];
    var startMinutes = timeAsString.split(":")[1];

    timeslotDate.setHours(startHours);
    timeslotDate.setMinutes(startMinutes);
    timeslotDate.setSeconds(0);
    timeslotDate.setMilliseconds(0);

    return timeslotDate;
}

//Event listener for the icon clicking
chrome.browserAction.onClicked.addListener(function (tab) {
    if (mainPomodoro.timeRemaining > 0) {
        if (PREFS.clickRestarts && mainPomodoro.currentMode == 'work') {
            mainPomodoro.restart();
        }
        if (PREFS.clickSkipBreak && (mainPomodoro.currentMode == 'break' || mainPomodoro.currentMode == 'longbreak')) {
            mainPomodoro.stop();
            mainPomodoro.start();
        }
    } else {
        mainPomodoro.start();
    }
});

//Check if blocked when a tab gets updated
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (mainPomodoro.currentMode == 'work' || mainPomodoro.currentMode == 'break_pending' || mainPomodoro.currentMode == 'longbreak_pending') {
        executeInTabIfBlocked('block', tab);
    }
});

//Add event listener to Chrome
chrome.notifications.onClicked.addListener(function (id) {
    // Clicking the notification brings you back to Chrome, in whatever window
    // you were last using.
    chrome.windows.getLastFocused(function (window) {
        chrome.windows.update(window.id, {
            focused: true
        });
    });
});

//Clear up context menu before adding any
chrome.contextMenus.removeAll();

//Add context menu to add current site to the block list
chrome.contextMenus.create({
    'title': chrome.i18n.getMessage("block_current_site_context"),
    'contexts': ['browser_action'],
    'onclick': function () {
        blockDomain();
    }
});

//Add context menu to add current site to the allow list
chrome.contextMenus.create({
    'title': chrome.i18n.getMessage("allow_current_site_context"),
    'contexts': ['browser_action'],
    'onclick': function () {
        allowDomain();
    }
});

//Add context menu to stop the timer
chrome.contextMenus.create({
    'title': chrome.i18n.getMessage("stop_current_timer"),
    'contexts': ['browser_action'],
    'onclick': function () {
        mainPomodoro.stop();
    }
});

chrome.alarms.onAlarm.addListener(function (alarm) {
    alarmEvent(alarm);
});

setTimeslotsAlarms();
checkStartingMode();