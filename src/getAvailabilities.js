const moment = require("moment");
const knex = require("../knexClient");


/**
 * Function to set recurring events metadata and collect dates of all recurring events
 * @param {Object} events 
 * @returns {Object} {
 *  recurringEvents : Dates of recurring events
 *  eventSchedule: Metadata of recurring events
 * }
 */
function setRecurringEvents(events){
  let recurringEvents = [];
  let eventSchedule = new Map();
  for(const event of events){
    if(event.kind==="opening" && event.weekly_recurring===1){
      recurringEvents.push(moment(event.starts_at).format('YYYY-MM-DD'));
    }
    let date = moment(event.starts_at).format('YYYY-MM-DD');
    eventSchedule.set(date,event);
  }
  return {
    recurringEvents: recurringEvents,
    eventSchedule: eventSchedule
  }
}

/**
 * Function to get recurring event data if input date overlaps with recurring event 
 * @param {String} inputDate 
 * @param {Array} recurringEvents 
 * @param {Object} eventSchedule 
 * @returns {Object} recurringEvent
 */
function getRecurringEvent(inputDate, recurringEvents, eventSchedule){

  // if the given date is present in recurring events list, simply return that event
  if(eventSchedule.has(inputDate) && eventSchedule.get(inputDate).kind==="opening"){
    return eventSchedule.get(inputDate);
  }

  let recurringEvent = new Object();

  //if the inputDate comes on 7*n(n=number of weeks) days after recurring event date, get the recurring event's data
  recurringEvents.forEach(eventDate=>{
    const diff = moment(inputDate).diff(eventDate,'days');
    if(diff>=0 && diff%7==0){
      const e = eventSchedule.get(eventDate);
      if(e.kind==="opening"){
        recurringEvent = e;
      }
    }
  });

  return recurringEvent;
}

/**
 * Function calculates avaiable slots for given date
 * @param {String} inputDate 
 * @param {Object} eventSchedule 
 * @param {Array} recurringEvent 
 * @returns {Array} slots
 */

function getAvailableSlots(inputDate,eventSchedule,recurringEvent){
  let slots = [];
  for (
    let date = moment(recurringEvent.starts_at);
    date.isBefore(recurringEvent.ends_at);
    date.add(30, "minutes")
  ){
    slots.push(date.format("H:mm"));
  }
  const event = eventSchedule.get(inputDate);
  if(event!==undefined){ // appointments are booked on that particular day
    let filteredSlots = [];
    for (
      let date = moment(event.starts_at);
      date.isBefore(event.ends_at);
      date.add(30, "minutes")
    ) {
      let formattedDate = date.format("H:mm");
      if (event.kind === "opening") {
        filteredSlots.push(formattedDate);
      } else if (event.kind === "appointment" ) {
        filteredSlots = slots.filter(slot=>slot!==formattedDate);
        slots = filteredSlots;
      }
    }
    return filteredSlots;
  }
  else{ // all slots are available
    return slots;
  }
}

/**
 * Function to get availabilities for numberOfDays consecutive days starting on given date
 * @param {String} date
 * @param {Number} numberOfDays
 * @returns {Array} availabilities
 */
module.exports = async function getAvailabilities(date, numberOfDays=7) {
  const events = await knex
    .select("kind", "starts_at", "ends_at", "weekly_recurring")
    .from("events")
    .where(function() {
      this.where("weekly_recurring", true).orWhere("ends_at", ">", +date);
    });

  let availabilities = new Map();
  let eventSchedule = new Map();
  let eventData = setRecurringEvents(events);
  let recurringEvents = eventData.recurringEvents;
  eventSchedule = eventData.eventSchedule;

  for (let i = 0; i < numberOfDays; ++i) {
    const tempDate = moment(date).add(i, "days").format('YYYY-MM-DD');
    const recurringEvent = getRecurringEvent(tempDate,recurringEvents,eventSchedule); //get recurring event for the given date, if any
    if(Object.entries(recurringEvent).length !== 0){
        availabilities.set(tempDate, {
          date: new Date(tempDate),
          slots: getAvailableSlots(tempDate,eventSchedule,recurringEvent)
        });
    }
    else{
      availabilities.set(tempDate, {
        date: new Date(tempDate),
        slots: []
      });
    }
    
  }
  return Array.from(availabilities.values())
}
