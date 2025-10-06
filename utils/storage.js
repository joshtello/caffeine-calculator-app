// LocalStorage utilities
export const getStorageKey = (date) => `caffeine-data-${date}`

export const getTodayDate = () => {
  return new Date().toISOString().split('T')[0] // YYYY-MM-DD format
}

export const saveDailyData = (date, drinks) => {
  const validDrinks = drinks.filter(drink => drink.dose && drink.startTimeString)
  const dailyData = validDrinks.map(drink => ({
    name: drink.name || 'Unnamed drink',
    time: drink.startTimeString, // Use startTimeString as the main time for backward compatibility
    dose: parseFloat(drink.dose),
    startTime: drink.startTime || Date.now(),
    endTime: drink.endTime || Date.now(),
    startTimeString: drink.startTimeString || '',
    endTimeString: drink.endTimeString || ''
  }))
  
  localStorage.setItem(getStorageKey(date), JSON.stringify(dailyData))
}

export const loadDailyData = (date) => {
  const stored = localStorage.getItem(getStorageKey(date))
  return stored ? JSON.parse(stored) : []
}

export const getHistoryData = (days = 7) => {
  const history = []
  const today = new Date()
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    const dailyData = loadDailyData(dateStr)
    const total = dailyData.reduce((sum, drink) => sum + drink.dose, 0)
    
    history.push({
      date: dateStr,
      dateDisplay: date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      }),
      drinks: dailyData,
      total: total,
      isToday: i === 0
    })
  }
  
  return history
}

// Personal information storage utilities
const PERSONAL_INFO_KEY = 'caffeine-calculator-personal-info'
const BEDTIME_KEY = 'caffeine-calculator-bedtime'
const RECENT_DRINKS_KEY = 'caffeine-calculator-recent-drinks'

export const savePersonalInfo = (personalInfo, units) => {
  const dataToSave = {
    personalInfo,
    units,
    lastUpdated: new Date().toISOString()
  }
  localStorage.setItem(PERSONAL_INFO_KEY, JSON.stringify(dataToSave))
}

export const loadPersonalInfo = () => {
  const stored = localStorage.getItem(PERSONAL_INFO_KEY)
  if (stored) {
    const data = JSON.parse(stored)
    return {
      personalInfo: data.personalInfo || { age: '', sex: '', weight: '' },
      units: data.units || { weight: 'metric' }
    }
  }
  return {
    personalInfo: { age: '', sex: '', weight: '' },
    units: { weight: 'metric' }
  }
}

export const saveBedtime = (bedtime) => {
  localStorage.setItem(BEDTIME_KEY, bedtime)
}

export const loadBedtime = () => {
  return localStorage.getItem(BEDTIME_KEY) || ''
}

export const saveRecentDrinks = (recentDrinks) => {
  localStorage.setItem(RECENT_DRINKS_KEY, JSON.stringify(recentDrinks))
}

export const loadRecentDrinks = () => {
  const stored = localStorage.getItem(RECENT_DRINKS_KEY)
  return stored ? JSON.parse(stored) : []
}

export const updateRecentDrinks = (selectedDrink, currentRecent) => {
  // Remove if already exists
  const filtered = currentRecent.filter(drink => drink.name !== selectedDrink.name)
  // Add to beginning and limit to 5
  const updated = [selectedDrink, ...filtered].slice(0, 5)
  saveRecentDrinks(updated)
  return updated
}

// Functions to manage individual drinks in today's data
export const updateTodayDrink = (date, drinkIndex, updatedDrink) => {
  const dailyData = loadDailyData(date)
  if (drinkIndex >= 0 && drinkIndex < dailyData.length) {
    dailyData[drinkIndex] = { ...dailyData[drinkIndex], ...updatedDrink }
    localStorage.setItem(getStorageKey(date), JSON.stringify(dailyData))
  }
  return dailyData
}

export const deleteTodayDrink = (date, drinkIndex) => {
  const dailyData = loadDailyData(date)
  if (drinkIndex >= 0 && drinkIndex < dailyData.length) {
    dailyData.splice(drinkIndex, 1)
    localStorage.setItem(getStorageKey(date), JSON.stringify(dailyData))
  }
  return dailyData
}

export const addQuickDrink = (date, drink) => {
  const dailyData = loadDailyData(date)
  const newDrink = {
    name: drink.name || 'Quick drink',
    time: drink.time || new Date().toTimeString().slice(0, 5), // Current time as HH:MM
    dose: parseFloat(drink.dose) || 0,
    startTime: drink.startTime || Date.now(),
    endTime: drink.endTime || Date.now(),
    startTimeString: drink.startTimeString || '',
    endTimeString: drink.endTimeString || ''
  }
  dailyData.push(newDrink)
  localStorage.setItem(getStorageKey(date), JSON.stringify(dailyData))
  return dailyData
}

// Stable ID generator
export const generateStableId = () => {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9)
}

