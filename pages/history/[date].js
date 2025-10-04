import { useRouter } from 'next/router'
import Link from 'next/link'
import { loadDailyData, getTodayDate } from '../../utils/storage'

export default function HistoryDatePage() {
  const router = useRouter()
  const { date } = router.query

  // Show loading while router is ready
  if (!router.isReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    )
  }

  // Load the drinks for this specific date
  const drinks = loadDailyData(date)
  const totalCaffeine = drinks.reduce((sum, drink) => sum + drink.dose, 0)

  // Format the date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long', 
      day: 'numeric' 
    })
  }

  // Check if this is today
  const isToday = date === getTodayDate()

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">
              Caffeine History
            </h1>
            <Link 
              href="/"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200"
            >
              ← Back to Calculator
            </Link>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {formatDate(date)}
              {isToday && <span className="ml-2 text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded-full">(Today)</span>}
            </h2>
            
            {totalCaffeine > 0 ? (
              <div className="flex items-center space-x-4">
                <div className="text-2xl font-bold text-gray-800">
                  {totalCaffeine} mg
                </div>
                {totalCaffeine >= 400 && (
                  <span className="text-orange-600 text-sm bg-orange-50 px-2 py-1 rounded-full">
                    ⚠️ Above 400mg guideline
                  </span>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No caffeine logged</p>
            )}
          </div>
        </div>

        {/* Drinks List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Drinks Consumed
          </h3>
          
          {drinks.length > 0 ? (
            <div className="space-y-4">
              {drinks.map((drink, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-semibold text-sm">
                          {index + 1}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {drink.name}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {new Date(`2000-01-01T${drink.time}`).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-800">
                      {drink.dose} mg
                    </div>
                    <div className="text-xs text-gray-500">
                      caffeine
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Summary */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-700">
                    Total Daily Intake:
                  </span>
                  <span className={`text-xl font-bold ${totalCaffeine >= 400 ? 'text-orange-600' : 'text-gray-800'}`}>
                    {totalCaffeine} mg
                  </span>
                </div>
                
                {totalCaffeine > 0 && (
                  <div className="mt-2 text-sm text-gray-600">
                    {totalCaffeine < 400 ? (
                      <span className="text-green-600">✅ Within safe daily limits</span>
                    ) : totalCaffeine < 600 ? (
                      <span className="text-orange-600">⚠️ Above typical safe guideline (400mg)</span>
                    ) : (
                      <span className="text-red-600">🚫 Very high intake - please double-check entries</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">☕</div>
              <h4 className="text-lg font-medium text-gray-600 mb-2">
                No drinks logged on this day
              </h4>
              <p className="text-gray-500">
                No caffeine was recorded for {formatDate(date)}
              </p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 flex justify-center space-x-4">
          <Link 
            href="/"
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200"
          >
            Back to Calculator
          </Link>
          
          {!isToday && (
            <Link 
              href="/"
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition duration-200"
            >
              Log Today's Drinks
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
