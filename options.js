/*
  Localization
*/

// Localize all elements with a data-i18n="message_name" attribute
var localizedElements = document.querySelectorAll('[data-i18n]'), el, message;
for (var i = 0; i < localizedElements.length; i++) {
    el = localizedElements[i];
    message = chrome.i18n.getMessage(el.getAttribute('data-i18n'));

    // Capitalize first letter if element has attribute data-i18n-caps
    if (el.hasAttribute('data-i18n-caps')) {
        message = message.charAt(0).toUpperCase() + message.substr(1);
    }

    el.innerHTML = message;
}

/*
  Form interaction
*/

var form = document.getElementById('options-form'),
    siteWhitelistEl = document.getElementById('whitelist'),
    siteBlacklistEl = document.getElementById('blacklist'),
    whitelistSelectEl = document.getElementById('blacklist-or-whitelist'),
    showNotificationsEl = document.getElementById('show-notifications'),
    shouldRingEl = document.getElementById('should-ring'),
    clickRestartsEl = document.getElementById('click-restarts'),
    clickSkipBreakEl = document.getElementById('click-skip-break'),
    autostartWorkEl = document.getElementById('autostart-work'),
    autostartBreakEl = document.getElementById('autostart-break'),
    saveSuccessfulEl = document.getElementById('save-successful'),
    timeFormatErrorEl = document.getElementById('time-format-error'),
    workcyclesEl = document.getElementById('workcycles'),
    longbreaksEnableEl = document.getElementById('longbreak-enable'),
    operationModeEl = document.getElementById('operation_mode'),
    butAddTimeEl = document.getElementById("butAddTime"),
    timeTableEl = document.getElementById("timeTable"),
    background = chrome.extension.getBackgroundPage(),
    startCallbacks = {},
    durationEls = {};

var timeslots = {};

durationEls['work'] = document.getElementById('work-duration');
durationEls['break'] = document.getElementById('break-duration');
durationEls['longbreak'] = document.getElementById('longbreak-duration');

var TIME_REGEX = /^([0-9]+)(:([0-9]{2}))?$/;

form.onsubmit = function () {
    console.log("form submitted");
    var durations = {},
        duration, durationStr, durationMatch;

    for (var key in durationEls) {
        durationStr = durationEls[key].value;
        durationMatch = durationStr.match(TIME_REGEX);
        if (durationMatch) {
            console.log(durationMatch);
            durations[key] = (60 * parseInt(durationMatch[1], 10));
            if (durationMatch[3]) {
                durations[key] += parseInt(durationMatch[3], 10);
            }
        } else {
            timeFormatErrorEl.className = 'show';
            return false;
        }
    }


    console.log(durations);

    saveTimetable();
    
    background.setPrefs({
        siteWhitelist: siteWhitelistEl.value.split(/\r?\n/),
        siteBlacklist: siteBlacklistEl.value.split(/\r?\n/),
        durations: durations,
        operationMode: operationModeEl.value,
        longbreaksEnabled: longbreaksEnableEl.checked,
        cyclesBeforeLongBreak: workcycles.value,
        showNotifications: showNotificationsEl.checked,
        shouldRing: shouldRingEl.checked,
        clickRestarts: clickRestartsEl.checked,
        clickSkipBreak: clickSkipBreakEl.checked,
        whitelist: whitelistSelectEl.selectedIndex == 1,
        autostartWork: autostartWorkEl.checked,
        autostartBreak: autostartBreakEl.checked,
        timeslots: timeslots,
    })



    saveSuccessfulEl.className = 'show';
    return false;
}

siteBlacklistEl.onfocus = formAltered;
siteWhitelistEl.onfocus = formAltered;
showNotificationsEl.onchange = formAltered;
shouldRingEl.onchange = formAltered;
clickRestartsEl.onchange = formAltered;
clickSkipBreakEl.onchange = formAltered;
autostartWorkEl.onchange = formAltered;
autostartBreakEl.onchange = formAltered;

whitelistSelectEl.onchange = function () {
    setListVisibility();
    formAltered();
};

//Load current values when page loads
siteBlacklistEl.value = background.PREFS.siteBlacklist.join("\n");
siteWhitelistEl.value = background.PREFS.siteWhitelist.join("\n");
showNotificationsEl.checked = background.PREFS.showNotifications;
shouldRingEl.checked = background.PREFS.shouldRing;
clickRestartsEl.checked = background.PREFS.clickRestarts;
clickSkipBreakEl.checked = background.PREFS.clickSkipBreak;
autostartWorkEl.checked = background.PREFS.autostartWork;
autostartBreakEl.checked = background.PREFS.autostartBreak;
operationModeEl.value = background.PREFS.operationMode;
longbreaksEnableEl.checked = background.PREFS.longbreaksEnabled;
workcyclesEl.value = background.PREFS.cyclesBeforeLongBreak;
whitelistSelectEl.selectedIndex = background.PREFS.whitelist ? 1 : 0;
setListVisibility();

timeslots = background.PREFS.timeslots;
loadTimetable();

//Define button event to add time
document.getElementById("butAddTime").addEventListener("click", addTimeLine);

var duration, minutes, seconds;

for (var key in durationEls) {
    duration = background.PREFS.durations[key];
    seconds = duration % 60;
    minutes = (duration - seconds) / 60;
    if (seconds >= 10) {
        durationEls[key].value = minutes + ":" + seconds;
    } else if (seconds > 0) {
        durationEls[key].value = minutes + ":0" + seconds;
    } else {
        durationEls[key].value = minutes;
    }
    durationEls[key].onfocus = formAltered;
}

function saveTimetable(){
    timeslots = {};
    for (var i = 1, row; row = timeTableEl.rows[i]; i++) {
        timeslots[i-1] = new TimeSlot();
        for (var j = 0, cell; cell = row.cells[j]; j++) {
            switch(j){
                case 0:
                    timeslots[i-1].startTime = cell.firstChild.value;
                    break;
                case 1:
                    timeslots[i-1].stopTime = cell.firstChild.value;
                    break;
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                case 8:
                    timeslots[i-1].daysEnabled[j-2] = cell.firstChild.checked;
                    break;
                default:
                    //Buttons and not required stuff
           }
         //iterate through columns
         //columns would be accessed using the "col" variable assigned in the for loop
       }  
    }
}

function loadTimetable(){
    emptyTimetable();
    var i = 0;
    for (var id in timeslots) {
        addTimeLine();
        timeTableEl.rows[i+1].cells[0].firstChild.value = timeslots[id].startTime;
        timeTableEl.rows[i+1].cells[1].firstChild.value = timeslots[id].stopTime;
        for (var j = 0; j <= 6; j++){
            timeTableEl.rows[i+1].cells[j+2].firstChild.checked = timeslots[id].daysEnabled[j];
        }
        i++;
     }
}

function setListVisibility() {
    if (whitelistSelectEl.selectedIndex) {
        siteBlacklistEl.style.display = 'none';
        siteWhitelistEl.style.display = 'inline';
    } else {
        siteBlacklistEl.style.display = 'inline';
        siteWhitelistEl.style.display = 'none';
    }
}

function formAltered() {
    saveSuccessfulEl.removeAttribute('class');
    timeFormatErrorEl.removeAttribute('class');
}

function setInputDisabled(state) {
    siteBlacklistEl.disabled = state;
    siteWhitelistEl.disabled = state;
    whitelistSelectEl.disabled = state;
    for (var key in durationEls) {
        durationEls[key].disabled = state;
    }
    
    showNotificationsEl.disabled = state;
    shouldRingEl.disabled = state;
    clickRestartsEl.disabled = state;
    clickSkipBreakEl.disabled = state;
    autostartWorkEl.disabled = state;
    autostartBreakEl.disabled = state;
    longbreaksEnableEl.disabled = state;
    workcyclesEl.disabled = state;
    operationModeEl.disabled = state;
    butAddTimeEl.disabled = state;
}

//this function add a line to the option page to select an exlusion time (lunch, dinner, weekends...)
function addTimeLine(){
    
    var newRow = timeTableEl.insertRow(-1);
    var startTimeCell = newRow.insertCell(-1);
    var endTimeCell = newRow.insertCell(-1);

    startTimeCell.innerHTML = "";
    var inputStartTime = document.createElement("input");
    inputStartTime.type = "time";
    startTimeCell.appendChild(inputStartTime);    
    
    endTimeCell.innerHTML = "";
    var inputEndTime = document.createElement("input");
    inputEndTime.type = "time";
    endTimeCell.appendChild(inputEndTime);    

    for (var i=0; i<7; i++){
        var daysCell = newRow.insertCell(-1);
        var checkDays = document.createElement("input");
        checkDays.type = "checkbox"
        daysCell.innerHTML = "";
        daysCell.appendChild(checkDays);
    }
    
    var upIconCell = newRow.insertCell(-1);
    upIconCell.innerHTML = "";
    var upIcon = document.createElement("i");
    upIcon.className = "fa fa-arrow-up";
    upIcon.addEventListener("click", raiseLine, false);
    //deleteIcon.aria-hidden="true";
    upIconCell.appendChild(upIcon);       

    var downIconCell = newRow.insertCell(-1);
    downIconCell.innerHTML = "";
    var downIcon = document.createElement("i");
    downIcon.className = "fa fa-arrow-down";
    downIcon.addEventListener("click", lowerLine, false);
    //deleteIcon.aria-hidden="true";
    downIconCell.appendChild(downIcon);    

    var deleteIconCell = newRow.insertCell(-1);
    deleteIconCell.innerHTML = "";
    var deleteIcon = document.createElement("i");
    deleteIcon.className = "fa fa-times";
    deleteIcon.addEventListener("click", delTimeLine, false);
    //deleteIcon.aria-hidden="true";
    deleteIconCell.appendChild(deleteIcon);    

    
}

function raiseLine(){
    
}

function lowerLine(){
    
}

function delTimeLine(e){
    var cell = e.target.parentNode || window.event.srcElement;
    cell.parentNode.remove();
}

function emptyTimetable() {
    var rowCount = timeTableEl.rows.length;
    for (var i = rowCount - 1; i > 0; i--) {
        timeTableEl.deleteRow(i);
    }
}

startCallbacks.work = function () {
    document.body.className = 'work';
    setInputDisabled(true);
}

startCallbacks.break = function () {
    document.body.removeAttribute('class');
    setInputDisabled(false);
}

startCallbacks.longbreak = function () {
    document.body.removeAttribute('class');
    setInputDisabled(false);
}

if (background.mainPomodoro.mostRecentMode == 'work') {
    startCallbacks.work();
}

function TimeSlot (){
    this.startTime = '00:00';
    this.stopTime = '00:00';
    this.daysEnabled = {};
}