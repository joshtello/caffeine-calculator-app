import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">
          Caffeine Calculator
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Calculate how much caffeine will remain in your system at bedtime
        </p>
        <Link 
          href="/caffeine-calculator"
          className="bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200 text-lg font-medium"
        >
          Go to Calculator
        </Link>
      </div>
    </div>
  )
}
