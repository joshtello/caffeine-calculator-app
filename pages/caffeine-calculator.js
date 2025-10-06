import { useState, useEffect, useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import Select from 'react-select'
import Link from 'next/link'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import {
  getStorageKey,
  getTodayDate,
  saveDailyData,
  loadDailyData,
  getHistoryData,
  savePersonalInfo,
  loadPersonalInfo,
  saveBedtime,
  loadBedtime,
  saveRecentDrinks,
  loadRecentDrinks,
  updateRecentDrinks,
  updateTodayDrink,
  deleteTodayDrink,
  addQuickDrink,
  generateStableId
} from '../utils/storage'
import { verticalLinePlugin } from '../utils/plugins'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)



export default function CaffeineCalculator() {
  const [drinks, setDrinks] = useState([
    { id: 1, name: '', dose: '', intakeTime: '', startTime: Date.now(), endTime: Date.now(), startTimeString: '', endTimeString: '', isEditing: false }
  ])
  const [drinksDatabase, setDrinksDatabase] = useState([])
  const [recentDrinks, setRecentDrinks] = useState([])
  const [bedtime, setBedtime] = useState('')
  const [personalInfo, setPersonalInfo] = useState({
    age: '',
    sex: '',
    weight: ''
  })
  const [units, setUnits] = useState({
    weight: 'metric'   // 'metric' or 'imperial'
  })
  const [result, setResult] = useState(null)
  const [adjustedHalfLife, setAdjustedHalfLife] = useState(null)
  const [individualCutoffs, setIndividualCutoffs] = useState([])
  const [chartData, setChartData] = useState(null)
  const [dailyIntake, setDailyIntake] = useState(0)
  const [warningMessage, setWarningMessage] = useState(null)
  const [todayData, setTodayData] = useState([])
  const [historyData, setHistoryData] = useState([])
  const [showHistory, setShowHistory] = useState(false)

  const baseHalfLife = 5 // hours
  const safeSleepThreshold = 30 // mg

  // Calculate chart hours based on bedtime and drink times
  const chartHours = useMemo(() => {
    if (!bedtime) return 24 // Default to 24 hours if no bedtime set
    
    // Check if bedtime is past midnight (likely next day)
    const bedtimeHour = parseInt(bedtime.split(':')[0])
    if (bedtimeHour < 12) return 48 // Bedtime is likely next day (like 01:00, 02:00, etc.)
    
    // Check if any drink's end time extends past midnight
    const needsExtension = drinks.some(drink => {
      if (drink.endTimeString) {
        const endHour = parseInt(drink.endTimeString.split(':')[0])
        return endHour < 12 // End time is likely next day
      }
      return false
    })
    
    return needsExtension ? 48 : 24
  }, [drinks, bedtime])

  // Helper function to calculate caffeine curve (instant or gradual)
  const calculateCaffeineCurve = (startTime, endTime, caffeineMg, halfLifeHours = 5) => {
    const minutesToAbsorb = Math.max(1, (new Date(endTime) - new Date(startTime)) / 60000);
    const dataPoints = [];
    
    // Generate points for 24 hours from start time
    const totalMinutes = 24 * 60;
    
    // Check if this is instant consumption (startTime === endTime)
    const isInstant = minutesToAbsorb <= 1;
    
    if (isInstant) {
      // Instant consumption - full dose immediately, then decay
      for (let i = 0; i <= totalMinutes; i++) {
        const currentTime = new Date(new Date(startTime).getTime() + i * 60000);
        const hoursSinceConsumption = i / 60;
        
        // Full dose at time 0, then decay
        const caffeine = caffeineMg * Math.pow(0.5, hoursSinceConsumption / halfLifeHours);
        
        dataPoints.push({
          time: currentTime,
          caffeine: Math.max(0, caffeine)
        });
      }
    } else {
      // Gradual absorption over time
      const absorptionRate = caffeineMg / minutesToAbsorb;
      
      for (let i = 0; i <= totalMinutes; i++) {
        const currentTime = new Date(new Date(startTime).getTime() + i * 60000);
        
        let caffeine = 0;
        
        if (i <= minutesToAbsorb) {
          // During absorption period - show gradual increase
          const absorbed = absorptionRate * i; // caffeine absorbed so far
          caffeine = absorbed; // No decay during absorption
        } else {
          // After absorption period - full dose is absorbed, now decay
          const hoursSinceEndOfAbsorption = (i - minutesToAbsorb) / 60;
          caffeine = caffeineMg * Math.pow(0.5, hoursSinceEndOfAbsorption / halfLifeHours);
        }
        
        dataPoints.push({
          time: currentTime,
          caffeine: Math.max(0, caffeine)
        });
      }
    }
    return dataPoints;
  };
  
  // Helper function to sort drinks by start time
  const sortDrinksByTime = (drinksList) => {
    return [...drinksList].sort((a, b) => {
      // Put drinks without time at the end
      if (!a.startTimeString && !b.startTimeString) return 0
      if (!a.startTimeString) return 1
      if (!b.startTimeString) return -1
      
      // Compare times
      return a.startTimeString.localeCompare(b.startTimeString)
    })
  }
  
  // Load today's data and personal info on component mount
  useEffect(() => {
    // Load drinks database
    fetch('/data/drinks.json')
      .then(response => response.json())
      .then(data => setDrinksDatabase(data))
      .catch(error => console.error('Error loading drinks database:', error))

    const today = getTodayDate()
    const todaysData = loadDailyData(today)
    setTodayData(todaysData)
    setHistoryData(getHistoryData())
    
    // Convert today's logged drinks to the drinks format and merge with existing drinks
    const loggedDrinks = todaysData.map((drink, index) => ({
      id: `logged-${index}`,
      name: drink.name,
      dose: drink.dose.toString(),
      intakeTime: drink.time,
      startTime: drink.startTime || Date.now(),
      endTime: drink.endTime || Date.now(),
      startTimeString: drink.startTimeString || '',
      endTimeString: drink.endTimeString || '',
      isLogged: true,
      loggedIndex: index
    }))
    
    // Keep any existing calculation-only drinks and add logged drinks
    setDrinks(prev => {
      const calculationDrinks = prev.filter(d => !d.isLogged)
      const allDrinks = [...loggedDrinks, ...calculationDrinks]
      return sortDrinksByTime(allDrinks)
    })
    
    // Load saved personal information
    const savedData = loadPersonalInfo()
    setPersonalInfo(savedData.personalInfo)
    setUnits(savedData.units)
    
    // Load saved bedtime
    const savedBedtime = loadBedtime()
    setBedtime(savedBedtime)
    
    // Load recent drinks
    const savedRecentDrinks = loadRecentDrinks()
    setRecentDrinks(savedRecentDrinks)
  }, [])
  
  // Update history when drinks change
  useEffect(() => {
    setHistoryData(getHistoryData())
  }, [todayData])
  
  // Auto-save personal information when it changes
  useEffect(() => {
    // Only save if we have some personal info (avoid saving empty initial state)
    if (personalInfo.age || personalInfo.sex || personalInfo.weight) {
      savePersonalInfo(personalInfo, units)
    }
  }, [personalInfo, units])
  
  // Auto-save bedtime when it changes
  useEffect(() => {
    if (bedtime) {
      saveBedtime(bedtime)
    }
  }, [bedtime])

  // Auto-calculate results when data changes
  useEffect(() => {
    if (!bedtime || !personalInfo.age || !personalInfo.sex || !personalInfo.weight) {
      return // Don't calculate if required info is missing
    }
    
    const validDrinks = drinks.filter(drink => drink.dose && drink.startTimeString)
    if (validDrinks.length === 0) {
      return // Don't calculate if no valid drinks
    }
    
    // Calculate adjusted half-life based on personal info
    const halfLife = calculateAdjustedHalfLife(personalInfo, units)
    setAdjustedHalfLife(halfLife)
    
    // Calculate individual cutoff times for each drink
    const individualCutoffTimes = calculateIndividualCutoffTimes(validDrinks, bedtime, halfLife)
    setIndividualCutoffs(individualCutoffTimes)
    
    // Calculate daily intake and warning messages
    const totalDailyIntake = calculateDailyIntake(validDrinks)
    setDailyIntake(totalDailyIntake)
    
    // Check for warnings
    const dailyWarning = getWarningMessage(totalDailyIntake)
    const typoWarning = checkForTypo(validDrinks)
    
    // Set warning message (prioritize typo detection over daily intake warnings)
    if (typoWarning) {
      setWarningMessage(typoWarning)
    } else if (dailyWarning) {
      setWarningMessage(dailyWarning)
    } else {
      setWarningMessage(null)
    }
    
    // Calculate total caffeine remaining at bedtime
    let totalCaffeineLeft = 0
    validDrinks.forEach(drink => {
      const caffeineLeft = calculateCaffeineRemaining(
        parseFloat(drink.dose),
        bedtime,
        halfLife,
        drink.startTimeString,
        drink.endTimeString
      )
      totalCaffeineLeft += caffeineLeft
    })
    
    setResult(totalCaffeineLeft)
    setChartData(generateChartData(validDrinks, bedtime, halfLife, chartHours))
    
    // Save today's data to localStorage
    const today = getTodayDate()
    saveDailyData(today, validDrinks)
    setTodayData(loadDailyData(today))
  }, [drinks, bedtime, personalInfo, units, chartHours])
  
  const getCaffeineZone = (caffeineLevel) => {
    if (caffeineLevel < 30) {
      return {
        zone: 'safe',
        emoji: '✅',
        message: 'Safe Zone - Great for sleep quality!',
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200'
      }
    } else if (caffeineLevel <= 80) {
      return {
        zone: 'caution',
        emoji: '⚠️',
        message: 'Caution Zone - May affect sleep quality',
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200'
      }
    } else {
      return {
        zone: 'high-risk',
        emoji: '❌',
        message: 'High Risk Zone - Likely to disrupt sleep',
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200'
      }
    }
  }

  const calculateDailyIntake = (drinks) => {
    return drinks.reduce((total, drink) => {
      const dose = parseFloat(drink.dose) || 0
      return total + dose
    }, 0)
  }

  const getWarningMessage = (dailyIntake) => {
    if (dailyIntake < 600) {
      return null
    } else if (dailyIntake >= 600 && dailyIntake < 1000) {
      return {
        type: 'caution',
        message: `⚠️ You've logged ${dailyIntake} mg today — higher than the typical safe daily guideline (400 mg).`,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200'
      }
    } else if (dailyIntake >= 1000) {
      return {
        type: 'danger',
        message: `🚫 Extremely high caffeine intake can be dangerous. Please double-check this entry.`,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200'
      }
    }
    return null
  }

  const checkForTypo = (drinks) => {
    const highDoseDrink = drinks.find(drink => {
      const dose = parseFloat(drink.dose) || 0
      return dose > 5000
    })
    
    if (highDoseDrink) {
      const suggestedDose = Math.round(parseFloat(highDoseDrink.dose) / 100)
      return {
        type: 'typo',
        message: `❓ Did you mean ${suggestedDose} mg instead of ${highDoseDrink.dose} mg?`,
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200'
      }
    }
    return null
  }

  const convertToMetric = (value, type, unit) => {
    if (unit === 'metric') return parseFloat(value)
    
    if (type === 'weight') {
      // Convert pounds to kg
      return parseFloat(value) * 0.453592
    }
    return parseFloat(value)
  }

  const calculateAdjustedHalfLife = (personalInfo, units) => {
    let adjustedHalfLife = baseHalfLife
    
    const age = parseInt(personalInfo.age)
    const weight = convertToMetric(personalInfo.weight, 'weight', units.weight)
    const sex = personalInfo.sex
    
    // Age adjustments
    if (age > 50) {
      adjustedHalfLife += 1
    } else if (age >= 30 && age <= 50) {
      adjustedHalfLife += 0.5
    }
    
    // Weight adjustments (using metric values)
    if (weight < 60) {
      adjustedHalfLife += 0.5
    } else if (weight > 90) {
      adjustedHalfLife -= 0.5
    }
    
    // Sex adjustment
    if (sex === 'female') {
      adjustedHalfLife += 0.5
    }
    
    return Math.max(1, adjustedHalfLife) // Minimum 1 hour
  }

  const calculateCaffeineRemaining = (dose, bedtime, halfLife, startTime = null, endTime = null) => {
    const bed = new Date(`2000-01-01T${bedtime}`)
    
    // If we have startTime, use it (with or without endTime)
    if (startTime) {
      // If no endTime provided, treat as instant (startTime === endTime)
      const effectiveEndTime = endTime || startTime
      // Convert time strings to Date objects for today
      const today = new Date()
      const startDateTime = new Date(today.toDateString() + ' ' + startTime)
      const endDateTime = new Date(today.toDateString() + ' ' + effectiveEndTime)
      const bedtimeDateTime = new Date(today.toDateString() + ' ' + bedtime)
      
      // Handle case where bedtime is next day
      if (bedtimeDateTime < startDateTime) {
        bedtimeDateTime.setDate(bedtimeDateTime.getDate() + 1)
      }
      
      // Check if this is instant consumption
      const minutesToAbsorb = Math.max(1, (endDateTime - startDateTime) / 60000)
      const isInstant = minutesToAbsorb <= 1
      
      if (isInstant) {
        // Instant consumption - use simple decay formula
        const bedtimeDateTime = new Date(today.toDateString() + ' ' + bedtime)
        
        // Handle case where bedtime is next day
        if (bedtimeDateTime < startDateTime) {
          bedtimeDateTime.setDate(bedtimeDateTime.getDate() + 1)
        }
        
        const hoursSinceConsumption = (bedtimeDateTime - startDateTime) / (1000 * 60 * 60)
        
        if (hoursSinceConsumption < 0) {
          return 0 // Bedtime is before consumption
        }
        
        const caffeineAtBedtime = dose * Math.pow(0.5, hoursSinceConsumption / halfLife)
        return Math.max(0, caffeineAtBedtime)
      } else {
        // Gradual absorption - use curve calculation
        const curve = calculateCaffeineCurve(startDateTime, endDateTime, dose, halfLife)
        
        // Find caffeine level at bedtime
        const hoursSinceStart = (bedtimeDateTime - startDateTime) / (1000 * 60 * 60)
        
        if (hoursSinceStart < 0) {
          return 0 // Bedtime is before consumption started
        }
        
        // Find the closest data point in the curve
        let caffeineAtBedtime = 0
        for (let point of curve) {
          const pointHours = (point.time - startDateTime) / (1000 * 60 * 60)
          if (pointHours <= hoursSinceStart) {
            caffeineAtBedtime = point.caffeine
          } else {
            break
          }
        }
        
        return Math.max(0, caffeineAtBedtime)
      }
    }
    
    // Fallback to original instant absorption model using startTime as intake time
    if (startTime) {
      const intake = new Date(`2000-01-01T${startTime}`)
      
      // Handle case where bedtime is next day
      if (bed < intake) {
        bed.setDate(bed.getDate() + 1)
      }
      
      const hoursElapsed = (bed - intake) / (1000 * 60 * 60)
      const caffeineLeft = dose * Math.pow(0.5, hoursElapsed / halfLife)
      
      return Math.max(0, caffeineLeft)
    }
    
    return 0 // No valid time information
  }

  const calculateLatestSafeIntakeTime = (bedtime, halfLife, dose, threshold = safeSleepThreshold) => {
    // Calculate how many hours before bedtime to keep caffeine ≤ threshold
    // Using the formula: threshold = dose * (0.5)^(hours/halfLife)
    // Solving for hours: hours = halfLife * log2(dose/threshold)
    
    const hoursBeforeBed = halfLife * Math.log2(dose / threshold)
    
    // Convert bedtime to Date object
    const bed = new Date(`2000-01-01T${bedtime}`)
    
    // Calculate cutoff time
    const cutoff = new Date(bed.getTime() - (hoursBeforeBed * 60 * 60 * 1000))
    
    // Format as HH:MM AM/PM
    const hours = cutoff.getHours()
    const minutes = cutoff.getMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    const displayMinutes = minutes.toString().padStart(2, '0')
    
    return `${displayHours}:${displayMinutes} ${ampm}`
  }

  const calculateIndividualCutoffTimes = (drinks, bedtime, halfLife) => {
    const validDrinks = drinks.filter(drink => drink.dose && drink.startTimeString)
    const cutoffTimes = []
    let cumulativeCaffeineAtBedtime = 0
    
    // Calculate cumulative caffeine from all drinks at bedtime
    validDrinks.forEach(drink => {
      const caffeineLeft = calculateCaffeineRemaining(
        parseFloat(drink.dose),
        bedtime,
        halfLife,
        drink.startTimeString,
        drink.endTimeString
      )
      cumulativeCaffeineAtBedtime += caffeineLeft
    })
    
    // For each drink, calculate when it should be consumed to keep total ≤ 30mg
    validDrinks.forEach((drink, index) => {
      const drinkDose = parseFloat(drink.dose)
      
      // Calculate caffeine from all OTHER drinks at bedtime
      let otherDrinksCaffeine = 0
      validDrinks.forEach((otherDrink, otherIndex) => {
        if (otherIndex !== index) {
          const otherCaffeineLeft = calculateCaffeineRemaining(
            parseFloat(otherDrink.dose),
            bedtime,
            halfLife,
            otherDrink.startTimeString,
            otherDrink.endTimeString
          )
          otherDrinksCaffeine += otherCaffeineLeft
        }
      })
      
      // Calculate how much caffeine this drink can contribute to stay ≤ 30mg total
      const maxAllowedCaffeineFromThisDrink = Math.max(0, 30 - otherDrinksCaffeine)
      
      if (maxAllowedCaffeineFromThisDrink > 0) {
        // Calculate cutoff time for this drink
        const cutoffTime = calculateLatestSafeIntakeTime(bedtime, halfLife, drinkDose, maxAllowedCaffeineFromThisDrink)
        cutoffTimes.push({
          name: drink.name,
          dose: drink.dose,
          cutoffTime: cutoffTime
        })
      } else {
        // This drink would push total over 30mg, so cutoff is already passed
        cutoffTimes.push({
          name: drink.name,
          dose: drink.dose,
          cutoffTime: "Already over limit"
        })
      }
    })
    
    return cutoffTimes
  }

  const generateChartData = (drinks, bedtime, halfLife, chartHours) => {
    const labels = []
    const datasets = []
    
    // Generate data points (every hour)
    for (let i = 0; i < chartHours; i++) {
      const hour = i % 24
      const day = Math.floor(i / 24)
      const timeString = day === 0 ? `${String(hour).padStart(2, '0')}:00` : `${String(hour).padStart(2, '0')}:00 (+1)`
      labels.push(timeString)
    }
    
    // Colors for different drinks
    const colors = [
      { border: 'rgb(75, 192, 192)', background: 'rgba(75, 192, 192, 0.2)' },
      { border: 'rgb(255, 99, 132)', background: 'rgba(255, 99, 132, 0.2)' },
      { border: 'rgb(54, 162, 235)', background: 'rgba(54, 162, 235, 0.2)' },
      { border: 'rgb(255, 205, 86)', background: 'rgba(255, 205, 86, 0.2)' },
      { border: 'rgb(153, 102, 255)', background: 'rgba(153, 102, 255, 0.2)' },
      { border: 'rgb(255, 159, 64)', background: 'rgba(255, 159, 64, 0.2)' },
    ]
    
    drinks.forEach((drink, index) => {
      if (drink.dose && drink.startTimeString) {
        const data = []
        
        // If we have startTime, determine if it's instant or gradual
        if (drink.startTimeString) {
          const today = new Date()
          const startDateTime = new Date(today.toDateString() + ' ' + drink.startTimeString)
          
          // Check if this is instant consumption (no endTime or endTime === startTime)
          const isInstant = !drink.endTimeString || drink.endTimeString === drink.startTimeString
          
          if (isInstant) {
            // Instant consumption - use simple decay formula
            for (let i = 0; i < chartHours; i++) {
              const hour = i % 24
              const day = Math.floor(i / 24)
              const currentHour = new Date(today.toDateString() + ` ${String(hour).padStart(2, '0')}:00:00`)
              
              // If this is the next day, add 24 hours
              if (day > 0) {
                currentHour.setDate(currentHour.getDate() + day)
              }
              
              // Calculate hours since consumption
              const hoursSinceConsumption = (currentHour - startDateTime) / (1000 * 60 * 60)
              
              if (hoursSinceConsumption < 0) {
                data.push(0) // Before consumption
              } else {
                // Instant consumption - full dose immediately, then decay
                const caffeine = parseFloat(drink.dose) * Math.pow(0.5, hoursSinceConsumption / halfLife)
                data.push(Math.max(0, caffeine))
              }
            }
          } else {
            // Gradual absorption - use curve calculation
            const effectiveEndTime = drink.endTimeString
            const endDateTime = new Date(today.toDateString() + ' ' + effectiveEndTime)
            
            // Calculate caffeine curve
            const curve = calculateCaffeineCurve(startDateTime, endDateTime, parseFloat(drink.dose), halfLife)
            
            // Generate data points for each hour
            for (let i = 0; i < chartHours; i++) {
              const hour = i % 24
              const day = Math.floor(i / 24)
              const currentHour = new Date(today.toDateString() + ` ${String(hour).padStart(2, '0')}:00:00`)
              
              // If this is the next day, add 24 hours
              if (day > 0) {
                currentHour.setDate(currentHour.getDate() + day)
              }
              
              // Find caffeine level at this hour
              let caffeineAtHour = 0
              for (let point of curve) {
                if (point.time <= currentHour) {
                  caffeineAtHour = point.caffeine
                } else {
                  break
                }
              }
              
              data.push(Math.max(0, caffeineAtHour))
            }
          }
        }
        
        datasets.push({
          label: `${drink.name} (${drink.dose}mg)`,
          data,
          borderColor: colors[index % colors.length].border,
          backgroundColor: colors[index % colors.length].background,
          tension: 0.1,
        })
      }
    })
    
    return {
      labels,
      datasets,
    }
  }


  const addDrink = () => {
    const newId = generateStableId()
    const now = Date.now()
    const newDrinks = [...drinks, { id: newId, name: '', dose: '', intakeTime: '', startTime: now, endTime: now, startTimeString: '', endTimeString: '', isEditing: true }]
    setDrinks(sortDrinksByTime(newDrinks))
  }

  const removeDrink = (id) => {
    if (drinks.length > 1) {
      setDrinks(drinks.filter(drink => drink.id !== id))
    }
  }

  const updateDrink = (id, field, value) => {
    // Only update if the drink is in editing mode
    setDrinks(drinks.map(drink => {
      if (drink.id === id && drink.isEditing) {
        const updatedDrink = { ...drink, [field]: value }
        
        // If the drink name is "Instant", ensure startTime === endTime
        if (field === 'name' && value === 'Instant') {
          const now = Date.now()
          const currentTimeString = new Date().toTimeString().slice(0, 5) // HH:MM format
          updatedDrink.startTime = now
          updatedDrink.endTime = now
          updatedDrink.startTimeString = currentTimeString
          updatedDrink.endTimeString = currentTimeString
        }
        
        return updatedDrink
      }
      return drink
    }))
  }

  const startEditing = (id) => {
    setDrinks(drinks.map(drink => 
      drink.id === id ? { ...drink, isEditing: true } : drink
    ))
  }

  const cancelEditing = (id) => {
    setDrinks(drinks.map(drink => 
      drink.id === id ? { ...drink, isEditing: false } : drink
    ))
  }


  const handleDrinkSelection = (id, selectedDrinkName) => {
    // Handle "Create Custom Drink" option
    if (selectedDrinkName === "CREATE_CUSTOM_DRINK") {
      // Don't clear the name - let user continue typing if they already started
      // Just ensure we're in custom drink mode
      return
    }
    
    // Check both drinksDatabase and recentDrinks for the selected drink
    let selectedDrink = drinksDatabase.find(drink => drink.name === selectedDrinkName)
    
    // If not found in database, check recent drinks (custom drinks)
    if (!selectedDrink) {
      selectedDrink = recentDrinks.find(drink => drink.name === selectedDrinkName)
    }
    
    if (selectedDrink) {
      // Update recent drinks
      const updatedRecent = updateRecentDrinks(selectedDrink, recentDrinks)
      setRecentDrinks(updatedRecent)
      
      const now = Date.now()
      const currentTimeString = new Date().toTimeString().slice(0, 5) // HH:MM format
      
      setDrinks(drinks.map(drink => 
        drink.id === id ? { 
          ...drink, 
          name: selectedDrink.name, 
          dose: selectedDrink.caffeine.toString(),
          // If it's Instant, startTime === endTime, otherwise use current time as default
          startTime: selectedDrink.isInstant ? now : now,
          endTime: selectedDrink.isInstant ? now : now,
          startTimeString: selectedDrink.isInstant ? currentTimeString : currentTimeString,
          endTimeString: selectedDrink.isInstant ? currentTimeString : currentTimeString,
          isEditing: false // Exit edit mode when a drink is selected from database
        } : drink
      ))
    }
  }

  const createGroupedOptions = () => {
    const groups = []
    
    // Add "Create Custom Drink" option at the top
    groups.push({
      label: "Actions",
      options: [{
        value: "CREATE_CUSTOM_DRINK",
        label: "➕ Create Custom Drink",
        drink: { name: "CREATE_CUSTOM_DRINK", isCreateCustom: true }
      }]
    })
    
    // Separate custom drinks from other recent drinks
    const customDrinks = recentDrinks.filter(drink => drink.isCustom)
    const otherRecentDrinks = recentDrinks.filter(drink => !drink.isCustom)
    
    // Custom Drinks group (if there are any)
    if (customDrinks.length > 0) {
      groups.push({
        label: "My Custom Drinks",
        options: customDrinks.map(drink => ({
          value: drink.name,
          label: `${drink.name} — ${drink.caffeine}mg`,
          drink: drink
        }))
      })
    }
    
    // Recent Drinks group (only if there are non-custom recent drinks)
    if (otherRecentDrinks.length > 0) {
      groups.push({
        label: "Recent Drinks",
        options: otherRecentDrinks.map(drink => ({
          value: drink.name,
          label: `${drink.name} — ${drink.caffeine}mg`,
          drink: drink
        }))
      })
    }
    
    // Group drinks by category
    const categories = {}
    drinksDatabase.forEach(drink => {
      if (!categories[drink.category]) {
        categories[drink.category] = []
      }
      categories[drink.category].push({
        value: drink.name,
        label: `${drink.name} — ${drink.caffeine}mg`,
        drink: drink
      })
    })
    
    // Add category groups
    Object.keys(categories).forEach(category => {
      groups.push({
        label: category,
        options: categories[category]
      })
    })
    
    return groups
  }

  const processDrinkUpdate = (id, field, value) => {
    // Just update the drink in state, no automatic processing
    setDrinks(drinks.map(drink => 
      drink.id === id ? { ...drink, [field]: value } : drink
    ))
  }

  const handleDrinkDone = (id) => {
    const drink = drinks.find(d => d.id === id)
    if (!drink) return

    // Check if all required fields are filled
    const isComplete = drink.name && 
                      drink.dose && 
                      parseFloat(drink.dose) > 0 && 
                      drink.startTimeString

    if (!isComplete) {
      alert('Please fill in all required fields (drink name, dose, and start time)')
      return
    }

    // Create updated drink object
    const updatedDrink = { ...drink }

    // Check if this is a custom drink (not in database and not already a recent drink)
    if (!drinksDatabase.find(db => db.name === drink.name.trim()) && !recentDrinks.find(r => r.name === drink.name.trim())) {
      const customDrink = {
        name: drink.name.trim(),
        caffeine: parseFloat(drink.dose),
        category: 'Custom',
        isCustom: true
      }
      // Add to recent drinks for easy selection
      const updatedRecent = updateRecentDrinks(customDrink, recentDrinks)
      setRecentDrinks(updatedRecent)
    }

    // Process the drink - convert to logged drink if complete and not already logged
    const updatedDrinks = drinks.map(d => {
      if (d.id === id) {
        if (!d.isLogged) {
          // Convert to logged drink
          const today = getTodayDate()
          const loggedDrink = {
            name: updatedDrink.name,
            dose: parseFloat(updatedDrink.dose),
            time: updatedDrink.startTimeString, // Use startTimeString as the main time
            startTime: updatedDrink.startTime || Date.now(),
            endTime: updatedDrink.endTime || Date.now(),
            startTimeString: updatedDrink.startTimeString || '',
            endTimeString: updatedDrink.endTimeString || ''
          }
          
          // Add to localStorage
          const updatedData = addQuickDrink(today, loggedDrink)
          setTodayData(updatedData)
          
          // Return as logged drink with new index
          return {
            ...updatedDrink,
            isLogged: true,
            loggedIndex: updatedData.length - 1
          }
        } else {
          // Update existing logged drink in localStorage
          const today = getTodayDate()
          const loggedUpdate = {
            name: updatedDrink.name,
            dose: parseFloat(updatedDrink.dose) || 0,
            time: updatedDrink.startTimeString,
            startTime: updatedDrink.startTime || Date.now(),
            endTime: updatedDrink.endTime || Date.now(),
            startTimeString: updatedDrink.startTimeString || '',
            endTimeString: updatedDrink.endTimeString || ''
          }
          
          const updatedData = updateTodayDrink(today, d.loggedIndex, loggedUpdate)
          setTodayData(updatedData)
          
          return updatedDrink
        }
      }
      return d
    })
    
    // Sort drinks by time and update state, exit edit mode
    setDrinks(sortDrinksByTime(updatedDrinks.map(d => 
      d.id === id ? { ...d, isEditing: false } : d
    )))
  }

  // Handler for deleting drinks in unified list

  const handleDeleteDrink = (drinkId) => {
    if (window.confirm('Are you sure you want to delete this drink?')) {
      const drink = drinks.find(d => d.id === drinkId)
      
      if (drink && drink.isLogged) {
        // Delete from localStorage
        const today = getTodayDate()
        const updatedData = deleteTodayDrink(today, drink.loggedIndex)
        setTodayData(updatedData)
      }
      
      // Remove from drinks list
      setDrinks(prev => prev.filter(d => d.id !== drinkId))
    }
  }


  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 text-center mb-8">
          Caffeine Calculator
        </h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <form className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>
                {(personalInfo.age || personalInfo.sex || personalInfo.weight) && (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                    ✓ Auto-saved
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-blue-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Age
                  </label>
                  <input
                    type="number"
                    value={personalInfo.age}
                    onChange={(e) => setPersonalInfo({...personalInfo, age: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., 25"
                    min="1"
                    max="120"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sex
                  </label>
                  <select
                    value={personalInfo.sex}
                    onChange={(e) => setPersonalInfo({...personalInfo, sex: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Weight
                    </label>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => setUnits({...units, weight: 'metric'})}
                        className={`px-2 py-1 text-xs rounded ${
                          units.weight === 'metric' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        kg
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnits({...units, weight: 'imperial'})}
                        className={`px-2 py-1 text-xs rounded ${
                          units.weight === 'imperial' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        lbs
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    value={personalInfo.weight}
                    onChange={(e) => setPersonalInfo({...personalInfo, weight: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={units.weight === 'metric' ? "e.g., 70" : "e.g., 154"}
                    min={units.weight === 'metric' ? "30" : "66"}
                    max={units.weight === 'metric' ? "300" : "660"}
                    step="0.1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {units.weight === 'metric' ? 'Weight in kilograms' : 'Weight in pounds'}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Your Drinks</h2>
                {todayData.length > 0 && (
                  <span className="text-sm text-gray-600 bg-blue-50 px-3 py-1 rounded-full">
                    {todayData.reduce((sum, drink) => sum + drink.dose, 0)} mg logged today
                    {todayData.reduce((sum, drink) => sum + drink.dose, 0) >= 400 && (
                      <span className="ml-1 text-orange-600">⚠️</span>
                    )}
                  </span>
                )}
              </div>
              
              {drinks.map((drink, index) => (
                <div key={drink.id} className={`border rounded-lg p-4 ${
                  drink.isLogged 
                    ? 'border-blue-200 bg-blue-50' 
                    : 'border-gray-200 bg-gray-50'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-800">
                        {drink.name || 'Unnamed drink'}
                      </span>
                    </div>
                    <div className="flex space-x-2">
                      {drink.isEditing ? (
                        <>
                          <button
                            onClick={() => handleDrinkDone(drink.id)}
                            disabled={!drink.name || !drink.dose || parseFloat(drink.dose) <= 0 || !drink.startTimeString}
                            className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded transition duration-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                          >
                            Done
                          </button>
                          <button
                            onClick={() => cancelEditing(drink.id)}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition duration-200"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEditing(drink.id)}
                          className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition duration-200"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteDrink(drink.id)}
                        className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition duration-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Drink (Optional)
                      </label>
                      <Select
                        value={drink.name && !drink.name.startsWith('Custom: ') ? { value: drink.name, label: `${drink.name} — ${drink.dose}mg` } : null}
                        onChange={(selectedOption) => {
                          if (selectedOption) {
                            handleDrinkSelection(drink.id, selectedOption.value)
                          } else {
                            updateDrink(drink.id, 'name', '')
                            updateDrink(drink.id, 'dose', '')
                          }
                        }}
                        options={createGroupedOptions()}
                        placeholder="Choose from database..."
                        isClearable
                        isSearchable={false}
                        isDisabled={!drink.isEditing}
                        className="mb-3"
                        styles={{
                          control: (base) => ({
                            ...base,
                            borderColor: '#d1d5db',
                            '&:hover': {
                              borderColor: '#9ca3af'
                            },
                            '&:focus': {
                              borderColor: '#3b82f6',
                              boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.1)'
                            }
                          })
                        }}
                      />
                      
                      {/* Custom drink name input - show when editing and no drink selected from database */}
                      {drink.isEditing && (
                        <div className="mt-3">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Custom Drink Name
                          </label>
                          <input
                            type="text"
                            value={drink.name || ''}
                            onChange={(e) => updateDrink(drink.id, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="e.g., My Custom Coffee Blend"
                          />
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Caffeine Dose (mg)
                      </label>
                      <input
                        type="number"
                        value={drink.dose}
                        onChange={(e) => updateDrink(drink.id, 'dose', e.target.value)}
                        disabled={!drink.isEditing}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                        placeholder="e.g., 200"
                        min="0"
                        step="0.1"
                      />
                    </div>
                    
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Time
                      </label>
                      <input
                        type="time"
                        value={drink.startTimeString || ''}
                        onChange={(e) => updateDrink(drink.id, 'startTimeString', e.target.value)}
                        disabled={!drink.isEditing}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Time <span className="text-gray-500 font-normal">(optional)</span>
                      </label>
                      <input
                        type="time"
                        value={drink.endTimeString || ''}
                        onChange={(e) => updateDrink(drink.id, 'endTimeString', e.target.value)}
                        disabled={!drink.isEditing}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-sm text-blue-700">
                      💡 <strong>Tip:</strong> If you don't enter an end time, the drink will be treated as "instant" (consumed all at once at the start time). 
                      Enter an end time to model gradual consumption over a period.
                    </p>
                  </div>
                  
                </div>
              ))}
              
              <button
                type="button"
                onClick={addDrink}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg py-4 text-gray-600 hover:border-blue-500 hover:text-blue-500 transition duration-200"
              >
                + Add Another Drink
              </button>
            </div>
            
            <div className="border-t pt-6">
              <div className="max-w-xs">
                <label htmlFor="bedtime" className="block text-sm font-medium text-gray-700 mb-2">
                  Bedtime
                </label>
                <input
                  type="time"
                  id="bedtime"
                  value={bedtime}
                  onChange={(e) => setBedtime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
          </form>
        </div>
        
        {/* History Section */}
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 space-y-2 sm:space-y-0">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Caffeine History</h2>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition duration-200 self-start sm:self-auto"
            >
              {showHistory ? 'Hide' : 'Show'} Past 7 Days
            </button>
          </div>
          
          {showHistory && (
            <div className="space-y-3">
              {historyData.map((day, index) => (
                <Link 
                  key={day.date}
                  href={`/history/${day.date}`}
                  className="block"
                >
                  <div 
                    className={`p-3 sm:p-4 rounded-lg border transition-all duration-200 cursor-pointer hover:shadow-md ${
                      day.isToday 
                        ? 'bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300' 
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <span className={`font-medium text-sm sm:text-base ${day.isToday ? 'text-blue-800' : 'text-gray-800'} truncate`}>
                          {day.dateDisplay}
                          {day.isToday && <span className="ml-1 text-xs text-blue-600">(Today)</span>}
                        </span>
                        {day.total >= 400 && (
                          <span className="text-orange-600 text-sm flex-shrink-0">⚠️</span>
                        )}
                      </div>
                      <span className={`font-bold text-sm sm:text-base flex-shrink-0 ${day.total >= 400 ? 'text-orange-600' : 'text-gray-600'}`}>
                        {day.total} mg
                      </span>
                    </div>
                    
                    {day.drinks.length > 0 && (
                      <div className="text-xs sm:text-sm text-gray-600 space-y-1">
                        {day.drinks.slice(0, 3).map((drink, drinkIndex) => (
                          <div key={drinkIndex} className="flex flex-col sm:flex-row sm:justify-between space-y-1 sm:space-y-0">
                            <span className="font-medium">{drink.name} - {drink.dose} mg</span>
                            <span className="text-gray-500">{
                              new Date(`2000-01-01T${drink.time}`).toLocaleTimeString([], {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })
                            }</span>
                          </div>
                        ))}
                        {day.drinks.length > 3 && (
                          <div className="text-xs text-gray-500 italic">
                            ... and {day.drinks.length - 3} more drinks
                          </div>
                        )}
                      </div>
                    )}
                    
                    {day.drinks.length === 0 && !day.isToday && (
                      <div className="text-xs text-gray-500 italic">No caffeine logged</div>
                    )}
                    
                    <div className="mt-2 text-xs text-gray-500">
                      Click to view details →
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        
        {result !== null && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Results</h2>
            <div className="space-y-4">
              {/* Daily Intake Summary */}
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-lg text-gray-700">
                  Total daily caffeine intake: <span className="font-bold text-blue-600">{dailyIntake} mg</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Sum of all caffeine doses entered today
                </p>
              </div>

              {/* Warning Messages */}
              {warningMessage && (
                <div className={`p-4 rounded-lg border ${warningMessage.bgColor} ${warningMessage.borderColor}`}>
                  <p className={`text-sm font-medium ${warningMessage.color} flex items-center`}>
                    <span className="mr-2 text-lg">{warningMessage.message.split(' ')[0]}</span>
                    {warningMessage.message}
                  </p>
                </div>
              )}

              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-lg text-gray-700">
                  Total caffeine left at bedtime: <span className="font-bold text-green-600">{result.toFixed(2)} mg</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  This is the combined caffeine from all your drinks
                </p>
                
                {/* Zone Feedback */}
                {(() => {
                  const zone = getCaffeineZone(result)
                  return (
                    <div className={`mt-3 p-3 rounded-lg border ${zone.bgColor} ${zone.borderColor}`}>
                      <p className={`text-sm font-medium ${zone.color} flex items-center`}>
                        <span className="mr-2 text-lg">{zone.emoji}</span>
                        {zone.message}
                      </p>
                    </div>
                  )
                })()}
              </div>
              
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-lg text-gray-700">
                  Your adjusted caffeine half-life: <span className="font-bold text-blue-600">{adjustedHalfLife.toFixed(1)} hours</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Based on your age, sex, and weight (base: 5.0 hours)
                </p>
              </div>
              
              {individualCutoffs.length > 0 && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-lg text-gray-700 mb-3">
                    Individual drink cutoff times (30mg threshold):
                  </p>
                  <div className="space-y-2">
                    {individualCutoffs.map((cutoff, index) => (
                      <p key={index} className="text-sm text-gray-600">
                        <span className="font-medium">{cutoff.name} ({cutoff.dose} mg):</span> cutoff = <span className="font-bold text-gray-800">{cutoff.cutoffTime}</span>
                      </p>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Stop consuming each drink after its cutoff time to keep levels ≤30mg at bedtime
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {chartData && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Caffeine Levels Over {chartHours > 24 ? '48 Hours' : '24 Hours'}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Each line represents a different drink. The chart shows how caffeine from each drink decays over time.
              {chartHours > 24 && " The chart extends to 48 hours to show bedtimes and caffeine effects past midnight."}
            </p>
            <div className="h-96">
              <Line
                data={chartData}
                plugins={[verticalLinePlugin]}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    title: {
                      display: true,
                      text: chartHours > 24 ? 'Caffeine Decay Over Time - Multiple Drinks (48 Hours)' : 'Caffeine Decay Over Time - Multiple Drinks'
                    },
                    legend: {
                      display: true,
                      position: 'top'
                    },
                    verticalLine: {
                      bedtime: bedtime,
                      chartHours: chartHours
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      title: {
                        display: true,
                        text: 'Caffeine (mg)'
                      }
                    },
                    x: {
                      title: {
                        display: true,
                        text: chartHours > 24 ? 'Time (24-hour format, +1 indicates next day)' : 'Time (24-hour format)'
                      }
                    }
                  }
                }}
              />
            </div>
          </div>
        )}
        
        {/* Disclaimer Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center leading-relaxed">
            <strong>Disclaimer:</strong> This app is for informational and educational purposes only. Caffeine metabolism varies widely between individuals. Results are estimates based on average scientific data and may not reflect your personal response. This tool does not provide medical advice and should not replace consultation with a qualified healthcare professional. For most adults, daily intake above 400 mg of caffeine may pose health risks. Use responsibly.
          </p>
        </div>
      </div>
    </div>
  )
}
