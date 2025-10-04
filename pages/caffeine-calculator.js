import { useState, useEffect } from 'react'
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
    { id: 1, name: '', dose: '', intakeTime: '' }
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
  
  // Helper function to sort drinks by intake time
  const sortDrinksByTime = (drinksList) => {
    return [...drinksList].sort((a, b) => {
      // Put drinks without time at the end
      if (!a.intakeTime && !b.intakeTime) return 0
      if (!a.intakeTime) return 1
      if (!b.intakeTime) return -1
      
      // Compare times
      return a.intakeTime.localeCompare(b.intakeTime)
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

  const calculateCaffeineRemaining = (dose, intakeTime, bedtime, halfLife) => {
    const intake = new Date(`2000-01-01T${intakeTime}`)
    const bed = new Date(`2000-01-01T${bedtime}`)
    
    // Handle case where bedtime is next day
    if (bed < intake) {
      bed.setDate(bed.getDate() + 1)
    }
    
    const hoursElapsed = (bed - intake) / (1000 * 60 * 60)
    const caffeineLeft = dose * Math.pow(0.5, hoursElapsed / halfLife)
    
    return Math.max(0, caffeineLeft)
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
    const validDrinks = drinks.filter(drink => drink.dose && drink.intakeTime)
    const cutoffTimes = []
    let cumulativeCaffeineAtBedtime = 0
    
    // Calculate cumulative caffeine from all drinks at bedtime
    validDrinks.forEach(drink => {
      const caffeineLeft = calculateCaffeineRemaining(
        parseFloat(drink.dose),
        drink.intakeTime,
        bedtime,
        halfLife
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
            otherDrink.intakeTime,
            bedtime,
            halfLife
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

  const generateChartData = (drinks, bedtime, halfLife) => {
    const labels = []
    const datasets = []
    
    // Generate 24 hours of data points (every hour)
    for (let i = 0; i < 24; i++) {
      const timeString = `${String(i).padStart(2, '0')}:00`
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
      if (drink.dose && drink.intakeTime) {
        const intake = new Date(`2000-01-01T${drink.intakeTime}`)
        const data = []
        
        for (let i = 0; i < 24; i++) {
          const currentTime = new Date(intake.getTime() + i * 60 * 60 * 1000)
          const hoursElapsed = i
          const caffeineLevel = parseFloat(drink.dose) * Math.pow(0.5, hoursElapsed / halfLife)
          data.push(Math.max(0, caffeineLevel))
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

  const handleSubmit = (e) => {
    e.preventDefault()
    
    if (!bedtime) {
      alert('Please enter your bedtime')
      return
    }
    
    if (!personalInfo.age || !personalInfo.sex || !personalInfo.weight) {
      alert('Please fill in all personal information fields')
      return
    }
    
    const validDrinks = drinks.filter(drink => drink.dose && drink.intakeTime)
    if (validDrinks.length === 0) {
      alert('Please add at least one drink with dose and time')
      return
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
        drink.intakeTime,
        bedtime,
        halfLife
      )
      totalCaffeineLeft += caffeineLeft
    })
    
    setResult(totalCaffeineLeft)
    setChartData(generateChartData(validDrinks, bedtime, halfLife))
    
    // Save today's data to localStorage
    const today = getTodayDate()
    saveDailyData(today, validDrinks)
    setTodayData(loadDailyData(today))
  }

  const addDrink = () => {
    const newId = generateStableId()
    const newDrinks = [...drinks, { id: newId, name: '', dose: '', intakeTime: '' }]
    setDrinks(sortDrinksByTime(newDrinks))
  }

  const removeDrink = (id) => {
    if (drinks.length > 1) {
      setDrinks(drinks.filter(drink => drink.id !== id))
    }
  }

  const updateDrink = (id, field, value) => {
    // Just update the drinks list without processing
    setDrinks(drinks.map(drink => 
      drink.id === id ? { ...drink, [field]: value } : drink
    ))
  }

  const handleDrinkSelection = (id, selectedDrinkName) => {
    const selectedDrink = drinksDatabase.find(drink => drink.name === selectedDrinkName)
    if (selectedDrink) {
      // Update recent drinks
      const updatedRecent = updateRecentDrinks(selectedDrink, recentDrinks)
      setRecentDrinks(updatedRecent)
      
      setDrinks(drinks.map(drink => 
        drink.id === id ? { 
          ...drink, 
          name: selectedDrink.name, 
          dose: selectedDrink.caffeine.toString() 
        } : drink
      ))
    }
  }

  const createGroupedOptions = () => {
    const groups = []
    
    // Recent Drinks group (only if there are recent drinks)
    if (recentDrinks.length > 0) {
      groups.push({
        label: "Recent Drinks",
        options: recentDrinks.map(drink => ({
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
    const drink = drinks.find(d => d.id === id)
    
    // Only process if the value actually changed
    if (drink && drink[field] === value) {
      return // No change, skip processing
    }
    
    // Create the updated drink object
    const updatedDrink = { ...drink, [field]: value }
    
    // Check if all required fields are filled
    const isComplete = updatedDrink.name && 
                      updatedDrink.dose && 
                      parseFloat(updatedDrink.dose) > 0 && 
                      updatedDrink.intakeTime
    
    // Update the drinks list
    const updatedDrinks = drinks.map(d => {
      if (d.id === id) {
        if (isComplete && !d.isLogged) {
          // Convert to logged drink if complete and not already logged
          const today = getTodayDate()
          const loggedDrink = {
            name: updatedDrink.name,
            dose: parseFloat(updatedDrink.dose),
            time: updatedDrink.intakeTime
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
        } else if (d.isLogged) {
          // Update existing logged drink in localStorage
          const today = getTodayDate()
          const loggedUpdate = {
            name: updatedDrink.name,
            dose: parseFloat(updatedDrink.dose) || 0,
            time: updatedDrink.intakeTime
          }
          
          const updatedData = updateTodayDrink(today, d.loggedIndex, loggedUpdate)
          setTodayData(updatedData)
          
          return updatedDrink
        }
        
        return updatedDrink
      }
      return d
    })
    
    // Sort drinks by time and update state
    setDrinks(sortDrinksByTime(updatedDrinks))
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
          <form onSubmit={handleSubmit} className="space-y-6">
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
                        value={drink.name ? { value: drink.name, label: `${drink.name} — ${drink.dose}mg` } : null}
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
                        isSearchable
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Or Enter Custom Drink Name
                        </label>
                        <input
                          type="text"
                          value={drink.name}
                          onChange={(e) => updateDrink(drink.id, 'name', e.target.value)}
                          onBlur={(e) => processDrinkUpdate(drink.id, 'name', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="e.g., Custom Coffee Blend"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Caffeine Dose (mg)
                      </label>
                      <input
                        type="number"
                        value={drink.dose}
                        onChange={(e) => updateDrink(drink.id, 'dose', e.target.value)}
                        onBlur={(e) => processDrinkUpdate(drink.id, 'dose', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., 200"
                        min="0"
                        step="0.1"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Time of Intake
                      </label>
                      <input
                        type="time"
                        value={drink.intakeTime}
                        onChange={(e) => updateDrink(drink.id, 'intakeTime', e.target.value)}
                        onBlur={(e) => processDrinkUpdate(drink.id, 'intakeTime', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
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
            
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200"
            >
              Calculate Total Caffeine Remaining
            </button>
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
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Caffeine Levels Over 24 Hours</h2>
            <p className="text-sm text-gray-600 mb-4">
              Each line represents a different drink. The chart shows how caffeine from each drink decays over time.
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
                      text: 'Caffeine Decay Over Time - Multiple Drinks'
                    },
                    legend: {
                      display: true,
                      position: 'top'
                    },
                    verticalLine: {
                      bedtime: bedtime
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
                        text: 'Time (24-hour format)'
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
