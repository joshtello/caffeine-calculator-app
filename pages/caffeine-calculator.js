import { useState, useEffect, useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import Select from 'react-select'
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
  generateStableId,
  loadCustomDrinks,
  addCustomDrink,
  updateCustomDrink,
  deleteCustomDrink
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
  const [customDrinks, setCustomDrinks] = useState([])
  const [selectedDate, setSelectedDate] = useState(getTodayDate())
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
  const [show7DaySummary, setShow7DaySummary] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  
  // Auto-save state tracking
  const [saveStatus, setSaveStatus] = useState('upToDate') // 'upToDate', 'saving', 'saved'
  const [lastSaveTime, setLastSaveTime] = useState(null)
  const [saveTimeout, setSaveTimeout] = useState(null)
  const [isActivelyEditing, setIsActivelyEditing] = useState(false)
  
  // Modal state
  const [showCustomDrinkModal, setShowCustomDrinkModal] = useState(false)
  const [editingCustomDrink, setEditingCustomDrink] = useState(null)
  const [customDrinkForm, setCustomDrinkForm] = useState({
    name: '',
    caffeine: '',
    category: 'Custom',
    colorTag: null
  })

  const baseHalfLife = 5 // hours
  const safeSleepThreshold = 30 // mg
  
  // Helper function to calculate total caffeine from all drinks at bedtime
  function calculateTotalCaffeineAtBedtime(drinks, bedtime, halfLife) {
    const bedtimeDate = new Date(`${new Date().toDateString()} ${bedtime}`);
    if (bedtimeDate.getHours() < 12) bedtimeDate.setDate(bedtimeDate.getDate() + 1);

    return drinks.reduce((total, drink) => {
      if (!drink.dose || !drink.startTimeString) return total;
      const dose = Number(drink.dose || 0);
      const caffeineRemaining = calculateCaffeineRemaining(
        dose,
        bedtime,
        halfLife,
        drink.startTimeString,
        drink.endTimeString
      );
      return total + Math.max(0, caffeineRemaining);
    }, 0);
  }
  
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

  const calculateCaffeineCurve = (startTime, endTime, caffeineMg, halfLifeHours = 5, totalHours = 48) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationHours = Math.max((end - start) / (1000 * 60 * 60), 0);
    const isInstant = durationHours < 0.016; // <1 min = instant
    const stepMinutes = 10;
    const step = stepMinutes / 60; // hours
    const intakeRate = isInstant ? 0 : caffeineMg / durationHours;

    let caffeine = 0;
    const points = [];

    for (let t = 0; t <= totalHours; t += step) {
      const currentTime = new Date(start.getTime() + t * 60 * 60 * 1000);

      if (isInstant) {
        if (t === 0 || t <= 0.01) {
          caffeine = caffeineMg;
        } else {
          caffeine = caffeineMg * Math.pow(0.5, t / halfLifeHours);
        }
      } else {
        const consuming = t < durationHours;
        caffeine *= Math.pow(0.5, step / halfLifeHours); // decay
        if (consuming) caffeine += intakeRate * step; // add intake
      }

      points.push({ time: currentTime, caffeine: Math.max(0, caffeine) });
    }

    return points;
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
  
  // Load drinks database on component mount
  useEffect(() => {
    // Load drinks database and filter out Special category and Instant drink
    fetch('/data/drinks.json')
      .then(response => response.json())
      .then(data => {
        const filteredDrinks = data.filter(
          drink => drink.category !== 'Special' && drink.name !== 'Instant'
        )
        setDrinksDatabase(filteredDrinks)
      })
      .catch(error => console.error('Error loading drinks database:', error))
    
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
    
    // Load custom drinks
    const savedCustomDrinks = loadCustomDrinks()
    setCustomDrinks(savedCustomDrinks)
  }, [])
  
  // Load data for selected date whenever it changes
  useEffect(() => {
    setIsTransitioning(true)
    
    const selectedDateData = loadDailyData(selectedDate)
    setTodayData(selectedDateData)
    setHistoryData(getHistoryData())
    
    // Convert selected date's logged drinks to the drinks format
    const loggedDrinks = selectedDateData.map((drink, index) => ({
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
    
    // If there are no logged drinks, show one empty drink in edit mode
    if (loggedDrinks.length === 0) {
      setDrinks([{ 
        id: generateStableId(), 
        name: '', 
        dose: '', 
        intakeTime: '', 
        startTime: Date.now(), 
        endTime: Date.now(), 
        startTimeString: '', 
        endTimeString: '', 
        isEditing: true 
      }])
    } else {
      setDrinks(sortDrinksByTime(loggedDrinks))
    }
    
    // Fade in animation
    setTimeout(() => setIsTransitioning(false), 300)
    
    // Reset save status when switching dates
    setSaveStatus('upToDate')
    setLastSaveTime(null)
  }, [selectedDate])
  
  // Update history when drinks change
  useEffect(() => {
    setHistoryData(getHistoryData())
  }, [todayData])
  
  // Debounced auto-save system (only for personal info and bedtime, not drinks while editing)
  useEffect(() => {
    // Skip if we're transitioning between dates
    if (isTransitioning) return
    
    // Skip if actively editing a drink
    if (isActivelyEditing) return
    
    // Skip if no data to save yet
    if (!personalInfo.age && !personalInfo.sex && !personalInfo.weight && drinks.every(d => !d.name && !d.dose)) {
      return
    }
    
    // Clear any existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
    
    // Set status to saving
    setSaveStatus('saving')
    
    // Debounce the actual save operation (800ms)
    const timeout = setTimeout(() => {
      // Save personal info
      if (personalInfo.age || personalInfo.sex || personalInfo.weight) {
        savePersonalInfo(personalInfo, units)
      }
      
      // Save bedtime
      if (bedtime) {
        saveBedtime(bedtime)
      }
      
      // Save drinks for selected date (only if not actively editing)
      if (!isActivelyEditing) {
        const validDrinks = drinks.filter(drink => drink.dose && drink.startTimeString)
        saveDailyData(selectedDate, validDrinks)
        setTodayData(loadDailyData(selectedDate))
      }
      
      // Update save status
      setLastSaveTime(new Date())
      setSaveStatus('saved')
      
      // After 2 seconds, change to "Up to date"
      setTimeout(() => {
        setSaveStatus('upToDate')
      }, 2000)
    }, 800)
    
    setSaveTimeout(timeout)
    
    // Cleanup function
    return () => {
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }, [personalInfo, units, bedtime, drinks, selectedDate, isTransitioning, isActivelyEditing])

  // Load dark mode preference from localStorage
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('cupacity-dark-mode')
    if (savedDarkMode !== null) {
      setIsDarkMode(JSON.parse(savedDarkMode))
    }
  }, [])

  // Save dark mode preference to localStorage
  useEffect(() => {
    localStorage.setItem('cupacity-dark-mode', JSON.stringify(isDarkMode))
  }, [isDarkMode])

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
  }

  // Auto-calculate results when data changes (but don't auto-save)
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
    
    // Calculate total caffeine remaining at bedtime using cumulative calculation
    const totalCaffeineLeft = calculateTotalCaffeineAtBedtime(validDrinks, bedtime, halfLife)
    setResult(totalCaffeineLeft)
    setChartData(generateChartData(validDrinks, bedtime, halfLife, chartHours))
  }, [drinks, bedtime, personalInfo, units, chartHours, selectedDate])
  
  const getCaffeineZone = (caffeineLevel) => {
    if (caffeineLevel < safeSleepThreshold) {
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
    const today = new Date();
    const bed = new Date(`${today.toDateString()} ${bedtime}`);
    if (bed.getHours() < 12) bed.setDate(bed.getDate() + 1); // next-day bedtime

    if (startTime) {
      const startDateTime = new Date(`${today.toDateString()} ${startTime}`);
      const endDateTime = new Date(`${today.toDateString()} ${endTime || startTime}`);
      if (endDateTime < startDateTime) endDateTime.setDate(endDateTime.getDate() + 1);

      const minutesToAbsorb = Math.max(1, (endDateTime - startDateTime) / 60000);
      const isInstant = minutesToAbsorb <= 1;

      if (isInstant) {
        const hoursSince = (bed - startDateTime) / (1000 * 60 * 60);
        if (hoursSince < 0) return 0;
        return Math.max(0, dose * Math.pow(0.5, hoursSince / halfLife));
      } else {
        const curve = calculateCaffeineCurve(startDateTime, endDateTime, dose, halfLife);
        const hoursSinceStart = (bed - startDateTime) / (1000 * 60 * 60);
        if (hoursSinceStart < 0) return 0;
        let caffeineAtBed = 0;
        for (let p of curve) {
          const hours = (p.time - startDateTime) / (1000 * 60 * 60);
          if (hours <= hoursSinceStart) caffeineAtBed = p.caffeine;
          else break;
        }
        return Math.max(0, caffeineAtBed);
      }
    }
    return 0;
  }

  const calculateLatestSafeIntakeTime = (bedtime, halfLife, dose, threshold = safeSleepThreshold) => {
    if (dose <= threshold) return "Any time today";

    const hoursBeforeBed = halfLife * Math.log2(dose / threshold);

    const now = new Date();
    const bed = new Date(`${now.toDateString()} ${bedtime}`);
    if (bed.getHours() < 12) bed.setDate(bed.getDate() + 1); // handle early-morning bedtimes

    let cutoff = new Date(bed.getTime() - hoursBeforeBed * 60 * 60 * 1000);

    // Clamp: not before now
    if (cutoff < now) return "Too late for today";

    // Clamp: not after bedtime
    if (cutoff > bed) cutoff = new Date(bed.getTime() - 15 * 60 * 1000);

    // Format
    const hours = cutoff.getHours();
    const minutes = cutoff.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");

    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const calculateIndividualCutoffTimes = (drinks, bedtime, halfLife) => {
    const validDrinks = drinks.filter(drink => drink.dose && drink.startTimeString)
    const cutoffTimes = []
    
    // For each drink, calculate when it should be consumed to keep total ≤ safeSleepThreshold mg
    validDrinks.forEach((drink, index) => {
      const drinkDose = parseFloat(drink.dose)
      
      // Calculate caffeine from all OTHER drinks at bedtime using cumulative calculation
      const otherDrinks = validDrinks.filter((_, otherIndex) => otherIndex !== index)
      const otherDrinksCaffeine = calculateTotalCaffeineAtBedtime(otherDrinks, bedtime, halfLife)
      
      // Calculate how much caffeine this drink can contribute to stay ≤ safeSleepThreshold mg total
      const maxAllowedCaffeineFromThisDrink = Math.max(0, safeSleepThreshold - otherDrinksCaffeine)
      
      if (maxAllowedCaffeineFromThisDrink > 0) {
        // Calculate cutoff time for this drink
        const cutoffTime = calculateLatestSafeIntakeTime(bedtime, halfLife, drinkDose, maxAllowedCaffeineFromThisDrink)
        cutoffTimes.push({
          name: drink.name,
          dose: drink.dose,
          cutoffTime: cutoffTime
        })
      } else {
        // This drink would push total over safeSleepThreshold mg, so cutoff is already passed
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
    const today = new Date();
    const labels = [];
    const datasets = [];

    for (let i = 0; i <= chartHours; i++) {
      const hour = i % 24;
      const day = Math.floor(i / 24);
      labels.push(`${String(hour).padStart(2, '0')}:00${day ? ' (+1)' : ''}`);
    }

    const colors = [
      { border: 'rgb(75,192,192)', background: 'rgba(75,192,192,0.2)' },
      { border: 'rgb(255,99,132)', background: 'rgba(255,99,132,0.2)' },
      { border: 'rgb(255,205,86)', background: 'rgba(255,205,86,0.2)' },
      { border: 'rgb(153,102,255)', background: 'rgba(153,102,255,0.2)' },
      { border: 'rgb(54,162,235)', background: 'rgba(54,162,235,0.2)' },
    ];

    for (let i = 0; i < drinks.length; i++) {
      const drink = drinks[i];
      if (!drink.dose || !drink.startTimeString) continue;

      const start = new Date(`${today.toDateString()} ${drink.startTimeString}`);
      const end = drink.endTimeString
        ? new Date(`${today.toDateString()} ${drink.endTimeString}`)
        : start;
      if (end < start) end.setDate(end.getDate() + 1);

      const startOffset = start.getHours() + start.getMinutes() / 60;
      const curve = calculateCaffeineCurve(start, end, parseFloat(drink.dose), halfLife, chartHours);
      const data = Array(chartHours + 1).fill(0);

      for (let j = 0; j < curve.length; j++) {
        const point = curve[j];
        const relHour = (point.time - start) / (1000 * 60 * 60);
        const globalIndex = Math.round(startOffset + relHour);
        if (globalIndex >= 0 && globalIndex < data.length) {
          data[globalIndex] = Math.max(data[globalIndex], point.caffeine);
        }
      }

      datasets.push({
        label: `${drink.name} (${drink.dose}mg)`,
        data,
        borderColor: colors[i % colors.length].border,
        backgroundColor: colors[i % colors.length].background,
      });
    }

    return { labels, datasets };
  };


  const addDrink = () => {
    const newId = generateStableId()
    const now = Date.now()
    const newDrinks = [...drinks, { id: newId, name: '', dose: '', intakeTime: '', startTime: now, endTime: now, startTimeString: '', endTimeString: '', isEditing: true }]
    setDrinks(sortDrinksByTime(newDrinks))
    setIsActivelyEditing(true)
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
        return { ...drink, [field]: value }
      }
      return drink
    }))
  }

  const startEditing = (id) => {
    setIsActivelyEditing(true)
    setDrinks(drinks.map(drink => 
      drink.id === id ? { ...drink, isEditing: true } : drink
    ))
  }

  const cancelEditing = (id) => {
    setIsActivelyEditing(false)
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
    
    // Check both drinksDatabase, recentDrinks, and customDrinks for the selected drink
    let selectedDrink = drinksDatabase.find(drink => drink.name === selectedDrinkName)
    
    // If not found in database, check custom drinks
    if (!selectedDrink) {
      selectedDrink = customDrinks.find(drink => drink.name === selectedDrinkName)
    }
    
    // If not found in custom drinks, check recent drinks
    if (!selectedDrink) {
      selectedDrink = recentDrinks.find(drink => drink.name === selectedDrinkName)
    }
    
    if (selectedDrink) {
      // Update recent drinks
      const updatedRecent = updateRecentDrinks(selectedDrink, recentDrinks)
      setRecentDrinks(updatedRecent)
      
      const now = Date.now()
      const currentTimeString = new Date().toTimeString().slice(0, 5) // HH:MM format
      
      setDrinks(drinks.map(drink => {
        if (drink.id === id) {
          // Only set startTime if it's currently empty
          const shouldSetStartTime = !drink.startTimeString
          
          return {
            ...drink, 
            name: selectedDrink.name, 
            dose: selectedDrink.caffeine.toString(),
            // Only set startTime and startTimeString if they're currently empty
            startTime: shouldSetStartTime ? now : drink.startTime,
            startTimeString: shouldSetStartTime ? currentTimeString : drink.startTimeString,
            // Don't automatically set endTime - leave it empty for user to decide
            // Keep isEditing true so user can adjust times/dose before clicking Done
            isEditing: true
          }
        }
        return drink
      }))
    }
  }
  
  // Custom drink modal handlers
  const openCustomDrinkModal = (drinkToEdit = null) => {
    if (drinkToEdit) {
      setEditingCustomDrink(drinkToEdit)
      setCustomDrinkForm({
        name: drinkToEdit.name,
        caffeine: drinkToEdit.caffeine.toString(),
        category: drinkToEdit.category || 'Custom',
        colorTag: drinkToEdit.colorTag || null
      })
    } else {
      setEditingCustomDrink(null)
      setCustomDrinkForm({
        name: '',
        caffeine: '',
        category: 'Custom',
        colorTag: null
      })
    }
    setShowCustomDrinkModal(true)
  }
  
  const closeCustomDrinkModal = () => {
    setShowCustomDrinkModal(false)
    setEditingCustomDrink(null)
    setCustomDrinkForm({
      name: '',
      caffeine: '',
      category: 'Custom',
      colorTag: null
    })
  }
  
  const handleSaveCustomDrink = () => {
    // Validate form
    if (!customDrinkForm.name.trim() || !customDrinkForm.caffeine || parseFloat(customDrinkForm.caffeine) <= 0) {
      alert('Please enter a valid drink name and caffeine amount.')
      return
    }
    
    if (editingCustomDrink) {
      // Update existing custom drink
      const updated = updateCustomDrink(editingCustomDrink.id, customDrinkForm)
      if (updated) {
        setCustomDrinks(loadCustomDrinks())
      }
    } else {
      // Add new custom drink
      const newDrink = addCustomDrink(customDrinkForm)
      setCustomDrinks(loadCustomDrinks())
    }
    
    closeCustomDrinkModal()
  }
  
  const handleDeleteCustomDrink = (drinkId, event) => {
    event.stopPropagation() // Prevent triggering the select
    if (window.confirm('Are you sure you want to delete this custom drink?')) {
      const updated = deleteCustomDrink(drinkId)
      setCustomDrinks(updated)
    }
  }
  
  const handleEditCustomDrink = (drink, event) => {
    event.stopPropagation() // Prevent triggering the select
    openCustomDrinkModal(drink)
  }

  const createGroupedOptions = () => {
    const groups = []
    
    // Custom Drinks group (if there are any)
    if (customDrinks.length > 0) {
      groups.push({
        label: "My Custom Drinks",
        options: customDrinks.map(drink => ({
          value: drink.name,
          label: (
            <div className="flex items-center justify-between w-full">
              <span style={{ color: drink.colorTag || 'inherit' }}>
                {drink.name} — {drink.caffeine}mg
              </span>
              <div className="flex space-x-1 ml-2">
                <button
                  onClick={(e) => handleEditCustomDrink(drink, e)}
                  className="text-blue-600 hover:text-blue-800 px-1"
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  onClick={(e) => handleDeleteCustomDrink(drink.id, e)}
                  className="text-red-600 hover:text-red-800 px-1"
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ),
          drink: drink
        }))
      })
    }
    
    // Recent Drinks group (only non-custom drinks)
    const otherRecentDrinks = recentDrinks.filter(drink => !drink.isCustom)
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
          const loggedDrink = {
            name: updatedDrink.name,
            dose: parseFloat(updatedDrink.dose),
            time: updatedDrink.startTimeString, // Use startTimeString as the main time
            startTime: updatedDrink.startTime || Date.now(),
            endTime: updatedDrink.endTime || Date.now(),
            startTimeString: updatedDrink.startTimeString || '',
            endTimeString: updatedDrink.endTimeString || ''
          }
          
          // Add to localStorage for selected date
          const updatedData = addQuickDrink(selectedDate, loggedDrink)
          setTodayData(updatedData)
          
          // Return as logged drink with new index
          return {
            ...updatedDrink,
            isLogged: true,
            loggedIndex: updatedData.length - 1
          }
        } else {
          // Update existing logged drink in localStorage
          const loggedUpdate = {
            name: updatedDrink.name,
            dose: parseFloat(updatedDrink.dose) || 0,
            time: updatedDrink.startTimeString,
            startTime: updatedDrink.startTime || Date.now(),
            endTime: updatedDrink.endTime || Date.now(),
            startTimeString: updatedDrink.startTimeString || '',
            endTimeString: updatedDrink.endTimeString || ''
          }
          
          const updatedData = updateTodayDrink(selectedDate, d.loggedIndex, loggedUpdate)
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
    
    // Exit editing mode and trigger save
    setIsActivelyEditing(false)
    
    // Trigger explicit save with visual feedback
    setSaveStatus('saving')
    setTimeout(() => {
      setSaveStatus('saved')
      setLastSaveTime(new Date())
      setTimeout(() => {
        setSaveStatus('upToDate')
      }, 2000)
    }, 300)
  }

  // Handler for deleting drinks in unified list

  const handleDeleteDrink = (drinkId) => {
    if (window.confirm('Are you sure you want to delete this drink?')) {
      const drink = drinks.find(d => d.id === drinkId)
      
      if (drink && drink.isLogged) {
        // Delete from localStorage for selected date
        const updatedData = deleteTodayDrink(selectedDate, drink.loggedIndex)
        setTodayData(updatedData)
      }
      
      // Remove from drinks list
      setDrinks(prev => prev.filter(d => d.id !== drinkId))
      
      // Exit editing mode if deleting currently edited drink
      if (drink && drink.isEditing) {
        setIsActivelyEditing(false)
      }
      
      // Trigger explicit save with visual feedback
      setSaveStatus('saving')
      setTimeout(() => {
        setSaveStatus('saved')
        setLastSaveTime(new Date())
        setTimeout(() => {
          setSaveStatus('upToDate')
        }, 2000)
      }, 300)
    }
  }
  
  // Format last save time for display
  const formatSaveTime = () => {
    if (!lastSaveTime) return ''
    return lastSaveTime.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }
  
  // Get save status display
  const getSaveStatusDisplay = () => {
    switch (saveStatus) {
      case 'saving':
        return {
          text: 'Saving...',
          color: isDarkMode ? 'text-yellow-400' : 'text-yellow-600',
          showTime: false
        }
      case 'saved':
        return {
          text: '✓ Saved',
          color: isDarkMode ? 'text-green-400' : 'text-green-600',
          showTime: true
        }
      case 'upToDate':
      default:
        return {
          text: 'Up to date',
          color: isDarkMode ? 'text-gray-500' : 'text-gray-400',
          showTime: false
        }
    }
  }
  
  // Date selector helper functions
  const formatSelectedDate = (dateString) => {
    const date = new Date(dateString + 'T00:00:00')
    const today = getTodayDate()
    const isToday = dateString === today
    
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' })
    const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    
    return isToday ? `${dayOfWeek}, ${monthDay} (Today)` : `${dayOfWeek}, ${monthDay}`
  }
  
  const goToToday = () => {
    setSelectedDate(getTodayDate())
  }
  
  const changeDate = (days) => {
    const currentDate = new Date(selectedDate + 'T00:00:00')
    currentDate.setDate(currentDate.getDate() + days)
    setSelectedDate(currentDate.toISOString().split('T')[0])
  }


  return (
    <div className={`min-h-screen py-8 px-4 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-200'}`}>
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className={`text-3xl font-bold text-center flex-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Cupacity
        </h1>
          <button
            onClick={toggleDarkMode}
            className={`p-2 rounded-lg transition-colors duration-200 ${
              isDarkMode 
                ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600' 
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
        
        {/* Date Selector */}
        <div className={`rounded-lg shadow-md p-4 mb-6 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-2xl">📅</span>
              <div className="flex-1 sm:flex-initial">
                <label className={`text-xs font-medium mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className={`px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
              <button
                onClick={() => changeDate(-1)}
                className={`p-2 rounded-md transition duration-200 ${
                  isDarkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
                title="Previous day"
              >
                ←
              </button>
              
              <button
                onClick={goToToday}
                className={`px-4 py-2 rounded-md font-medium transition duration-200 ${
                  selectedDate === getTodayDate()
                    ? isDarkMode 
                      ? 'bg-blue-900 text-blue-300 cursor-default' 
                      : 'bg-blue-100 text-blue-700 cursor-default'
                    : isDarkMode 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
                disabled={selectedDate === getTodayDate()}
              >
                Today
              </button>
              
              <button
                onClick={() => changeDate(1)}
                className={`p-2 rounded-md transition duration-200 ${
                  isDarkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
                title="Next day"
              >
                →
              </button>
            </div>
            
            <div className={`text-center sm:text-right flex-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <p className="font-semibold">{formatSelectedDate(selectedDate)}</p>
              {todayData.length > 0 && (
                <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {todayData.reduce((sum, drink) => sum + drink.dose, 0)} mg total
                </p>
              )}
            </div>
          </div>
        </div>
        
        <div className={`rounded-lg shadow-md p-6 mb-8 transition-opacity duration-300 ${isTransitioning ? 'opacity-50' : 'opacity-100'} ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
          <form className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Personal Information</h2>
                
                {/* Auto-save Status */}
                <div className="flex items-center gap-2">
                  {isActivelyEditing ? (
                    <span 
                      className={`text-xs px-2 py-1 font-medium transition-opacity duration-300 ${
                        isDarkMode ? 'text-orange-400' : 'text-orange-600'
                      }`}
                      title="Changes will be saved when you click Done"
                    >
                      Changes not saved
                    </span>
                  ) : (
                    <span 
                      className={`text-xs px-2 py-1 font-medium transition-opacity duration-300 ${getSaveStatusDisplay().color}`}
                      title={lastSaveTime ? `Last saved ${formatSaveTime()}` : 'Auto-save enabled'}
                    >
                      {getSaveStatusDisplay().text}
                      {getSaveStatusDisplay().showTime && lastSaveTime && (
                        <span className="ml-1 opacity-75">· {formatSaveTime()}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg ${
                isDarkMode ? 'bg-blue-900' : 'bg-blue-50'
              }`}>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Age
                  </label>
                  <input
                    type="number"
                    value={personalInfo.age}
                    onChange={(e) => setPersonalInfo({...personalInfo, age: e.target.value})}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-gray-50 border-gray-400 text-gray-900'
                    }`}
                    placeholder="e.g., 25"
                    min="1"
                    max="120"
                  />
                </div>
                
                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Sex
                  </label>
                  <select
                    value={personalInfo.sex}
                    onChange={(e) => setPersonalInfo({...personalInfo, sex: e.target.value})}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-gray-50 border-gray-400 text-gray-900'
                    }`}
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
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-gray-50 border-gray-400 text-gray-900'
                    }`}
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
                <div className="flex items-center gap-2">
                  <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Your Drinks</h2>
                  {saveStatus === 'saving' && (
                    <span className={`text-xs px-2 py-0.5 rounded animate-pulse ${
                      isDarkMode ? 'bg-yellow-900 text-yellow-300' : 'bg-yellow-100 text-yellow-600'
                    }`}>
                      •
                    </span>
                  )}
                </div>
                {todayData.length > 0 && (
                  <span className={`text-sm px-3 py-1 rounded-full ${
                    isDarkMode 
                      ? 'text-blue-400 bg-blue-900' 
                      : 'text-blue-600 bg-blue-50'
                  }`}>
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
                    ? `border-blue-200 ${isDarkMode ? 'bg-blue-900' : 'bg-blue-50'}` 
                    : `border-gray-200 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`
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
                            className={`px-2 py-1 text-xs rounded transition duration-200 disabled:cursor-not-allowed ${
                            isDarkMode 
                              ? 'bg-green-900 hover:bg-green-800 text-green-300 disabled:bg-gray-800 disabled:text-gray-500' 
                              : 'bg-green-100 hover:bg-green-200 text-green-700 disabled:bg-gray-100 disabled:text-gray-400'
                          }`}
                          >
                            Done
                          </button>
                          <button
                            onClick={() => cancelEditing(drink.id)}
                            className={`px-2 py-1 text-xs rounded transition duration-200 ${
                              isDarkMode 
                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            }`}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEditing(drink.id)}
                          className={`px-2 py-1 text-xs rounded transition duration-200 ${
                          isDarkMode 
                            ? 'bg-blue-900 hover:bg-blue-800 text-blue-300' 
                            : 'bg-blue-100 hover:bg-blue-200 text-blue-700'
                        }`}
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
                      <div className="flex items-center justify-between mb-2">
                        <label className={`block text-sm font-medium ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                          Select Drink (Optional)
                        </label>
                        {drink.isEditing && (
                          <button
                            type="button"
                            onClick={() => openCustomDrinkModal()}
                            className={`px-2 py-1 text-xs rounded transition duration-200 ${
                              isDarkMode 
                                ? 'bg-blue-900 hover:bg-blue-800 text-blue-300' 
                                : 'bg-blue-100 hover:bg-blue-200 text-blue-700'
                            }`}
                            title="Create a custom drink"
                          >
                            + Custom
                          </button>
                        )}
                      </div>
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
                    </div>
                    
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                        Caffeine Dose (mg)
                      </label>
                      <input
                        type="number"
                        value={drink.dose}
                        onChange={(e) => updateDrink(drink.id, 'dose', e.target.value)}
                        disabled={!drink.isEditing}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed ${
                          isDarkMode 
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 disabled:bg-gray-800' 
                            : 'bg-gray-50 border-gray-400 text-gray-900 disabled:bg-gray-200'
                        }`}
                        placeholder="e.g., 200"
                        min="0"
                        step="0.1"
                      />
                    </div>
                    
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                        Start Time
                      </label>
                      <input
                        type="time"
                        value={drink.startTimeString || ''}
                        onChange={(e) => updateDrink(drink.id, 'startTimeString', e.target.value)}
                        disabled={!drink.isEditing}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed ${
                          isDarkMode 
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 disabled:bg-gray-800' 
                            : 'bg-gray-50 border-gray-400 text-gray-900 disabled:bg-gray-200'
                        }`}
                      />
                    </div>
                    
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                        End Time <span className="text-gray-500 font-normal">(optional)</span>
                      </label>
                      <input
                        type="time"
                        value={drink.endTimeString || ''}
                        onChange={(e) => updateDrink(drink.id, 'endTimeString', e.target.value)}
                        disabled={!drink.isEditing}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed ${
                          isDarkMode 
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 disabled:bg-gray-800' 
                            : 'bg-gray-50 border-gray-400 text-gray-900 disabled:bg-gray-200'
                        }`}
                      />
                    </div>
                  </div>
                  
                  <div className={`mt-2 p-3 border rounded-md ${
                    isDarkMode 
                      ? 'bg-blue-900 border-blue-700' 
                      : 'bg-blue-50 border-blue-200'
                  }`}>
                    <p className={`text-sm ${
                      isDarkMode ? 'text-blue-300' : 'text-blue-700'
                    }`}>
                      💡 <strong>Tip:</strong> If you don't enter an end time, the drink will be treated as "instant" (consumed all at once at the start time). 
                      Enter an end time to model gradual consumption over a period.
                    </p>
                  </div>
                  
                </div>
              ))}
              
              <button
                type="button"
                onClick={addDrink}
                className={`w-full border-2 border-dashed rounded-lg py-4 transition duration-200 ${
                  isDarkMode 
                    ? 'border-gray-600 text-gray-400 hover:border-blue-400 hover:text-blue-400' 
                    : 'border-gray-300 text-gray-600 hover:border-blue-500 hover:text-blue-500'
                }`}
              >
                + Add Another Drink
              </button>
            </div>
            
            <div className="border-t pt-6">
              <div className="max-w-xs">
                <label htmlFor="bedtime" className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Bedtime
                </label>
                <input
                  type="time"
                  id="bedtime"
                  value={bedtime}
                  onChange={(e) => setBedtime(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-gray-50 border-gray-400 text-gray-900'
                    }`}
                />
              </div>
            </div>
            
          </form>
        </div>
        
        {result !== null && (
          <div className={`rounded-lg shadow-md p-6 mb-8 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <h2 className={`text-xl font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Results</h2>
            <div className="space-y-4">
              {/* Daily Intake Summary */}
              <div className={`p-4 rounded-lg ${
                isDarkMode ? 'bg-blue-900' : 'bg-blue-50'
              }`}>
                <p className={`text-lg ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
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
              
              <div className={`p-4 rounded-lg ${
                isDarkMode ? 'bg-blue-900' : 'bg-blue-50'
              }`}>
                <p className={`text-lg ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
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
          <div className={`rounded-lg shadow-md p-6 mb-8 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <h2 className={`text-xl font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Caffeine Levels Over {chartHours > 24 ? '48 Hours' : '24 Hours'}
            </h2>
            <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Each line represents a different drink. The chart shows how caffeine from each drink decays over time.
              {chartHours > 24 && " The chart extends to 48 hours to show bedtimes and caffeine effects past midnight."}
            </p>
            <div className={`h-96 ${isDarkMode ? 'dark' : ''}`}>
              <Line
                data={chartData}
                plugins={[verticalLinePlugin]}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  elements: {
                    point: {
                      radius: 2.5,                         // small dots for minimal clutter
                      hoverRadius: 6,                      // expand on hover
                      backgroundColor: (ctx) =>
                        ctx.chart.canvas.classList.contains('dark')
                          ? 'rgba(255,255,255,0.85)'       // bright dots for dark mode
                          : 'rgba(0,0,0,0.75)',            // dark dots for light mode
                      borderWidth: 2,
                      borderColor: (ctx) => ctx.dataset.borderColor,
                      hitRadius: 8,                        // easier to hover
                    },
                    line: {
                      tension: 0.35,                       // smoother curves
                      borderWidth: 2,
                    },
                  },
                  interaction: {
                    mode: 'nearest',
                    intersect: false,
                  },
                  plugins: {
                    title: {
                      display: true,
                      text: chartHours > 24 ? 'Caffeine Decay Over Time - Multiple Drinks (48 Hours)' : 'Caffeine Decay Over Time - Multiple Drinks'
                    },
                    legend: {
                      display: true,
                      position: 'top'
                    },
                    tooltip: {
                      backgroundColor: (ctx) =>
                        ctx.chart.canvas.classList.contains('dark')
                          ? 'rgba(30,30,30,0.95)'
                          : 'rgba(255,255,255,0.95)',
                      titleColor: (ctx) =>
                        ctx.chart.canvas.classList.contains('dark') ? '#f9fafb' : '#111827',
                      bodyColor: (ctx) =>
                        ctx.chart.canvas.classList.contains('dark') ? '#f3f4f6' : '#1f2937',
                      borderColor: (ctx) =>
                        ctx.chart.canvas.classList.contains('dark') ? '#374151' : '#d1d5db',
                      borderWidth: 1,
                      padding: 10,
                      displayColors: true,
                      usePointStyle: true,
                    },
                    verticalLine: {
                      bedtime: bedtime,
                      chartHours: chartHours
                    }
                  },
                  layout: {
                    padding: 10,
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
            
            {/* 7-Day Summary Button */}
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setShow7DaySummary(!show7DaySummary)}
                className={`px-4 py-2 rounded-md font-medium transition duration-200 ${
                  isDarkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                {show7DaySummary ? 'Hide' : 'Show'} 7-Day Summary
              </button>
            </div>
            
            {/* 7-Day Summary View */}
            {show7DaySummary && (
              <div className="mt-6 space-y-2">
                <h3 className={`text-lg font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  7-Day Caffeine Summary
                </h3>
                {historyData.map((day, index) => (
                  <div 
                    key={day.date}
                    onClick={() => setSelectedDate(day.date)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                      selectedDate === day.date
                        ? `border-blue-400 ${isDarkMode ? 'bg-blue-900' : 'bg-blue-100'}` 
                        : `border-gray-300 hover:border-gray-400 ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-3">
                        <span className={`font-medium ${day.isToday ? 'text-blue-600' : isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}>
                          {day.dateDisplay}
                          {day.isToday && <span className="ml-1 text-xs">(Today)</span>}
                        </span>
                        {day.total >= 400 && <span className="text-orange-600">⚠️</span>}
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`font-bold ${day.total >= 400 ? 'text-orange-600' : isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                          {day.total} mg
                        </span>
                        <div className="w-32 bg-gray-300 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all ${
                              day.total >= 400 ? 'bg-orange-600' : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min((day.total / 600) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    {day.drinks.length > 0 && (
                      <div className={`mt-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {day.drinks.length} drink{day.drinks.length !== 1 ? 's' : ''} logged
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Disclaimer Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center leading-relaxed">
            <strong>Disclaimer:</strong> This app is for informational and educational purposes only. Caffeine metabolism varies widely between individuals. Results are estimates based on average scientific data and may not reflect your personal response. This tool does not provide medical advice and should not replace consultation with a qualified healthcare professional. For most adults, daily intake above 400 mg of caffeine may pose health risks. Use responsibly.
          </p>
        </div>
      </div>
      
      {/* Custom Drink Modal */}
      {showCustomDrinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with blur */}
          <div 
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={closeCustomDrinkModal}
          ></div>
          
          {/* Modal Content */}
          <div className={`relative w-full max-w-md rounded-lg shadow-xl p-6 ${
            isDarkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-semibold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                {editingCustomDrink ? 'Edit Custom Drink' : 'Create Custom Drink'}
              </h2>
              <button
                onClick={closeCustomDrinkModal}
                className={`text-2xl font-bold ${
                  isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Drink Name */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Drink Name *
                </label>
                <input
                  type="text"
                  value={customDrinkForm.name}
                  onChange={(e) => setCustomDrinkForm({...customDrinkForm, name: e.target.value})}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="e.g., My Special Coffee"
                />
              </div>
              
              {/* Caffeine Amount */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Caffeine (mg) *
                </label>
                <input
                  type="number"
                  value={customDrinkForm.caffeine}
                  onChange={(e) => setCustomDrinkForm({...customDrinkForm, caffeine: e.target.value})}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="e.g., 150"
                  min="0"
                  step="1"
                />
              </div>
              
              {/* Category */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Category (Optional)
                </label>
                <select
                  value={customDrinkForm.category}
                  onChange={(e) => setCustomDrinkForm({...customDrinkForm, category: e.target.value})}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="Custom">Custom</option>
                  <option value="Coffee">Coffee</option>
                  <option value="Tea">Tea</option>
                  <option value="Energy Drink">Energy Drink</option>
                  <option value="Preworkout">Preworkout</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              {/* Color Tag */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Color Tag (Optional)
                </label>
                <div className="flex space-x-2">
                  {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCustomDrinkForm({...customDrinkForm, colorTag: color})}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        customDrinkForm.colorTag === color 
                          ? 'border-gray-900 scale-110' 
                          : 'border-gray-300 hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomDrinkForm({...customDrinkForm, colorTag: null})}
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                      customDrinkForm.colorTag === null 
                        ? 'border-gray-900 scale-110' 
                        : 'border-gray-300 hover:scale-105'
                    } ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}
                    title="No color"
                  >
                    <span className="text-xs">×</span>
                  </button>
                </div>
              </div>
            </div>
            
            {/* Modal Actions */}
            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleSaveCustomDrink}
                className={`flex-1 px-4 py-2 rounded-md font-medium transition duration-200 ${
                  isDarkMode 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {editingCustomDrink ? 'Update' : 'Save'}
              </button>
              <button
                onClick={closeCustomDrinkModal}
                className={`flex-1 px-4 py-2 rounded-md font-medium transition duration-200 ${
                  isDarkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
