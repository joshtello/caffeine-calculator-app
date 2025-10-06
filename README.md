# ☕ Cupacity

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14.0.0-black?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

**A smart, personalized caffeine calculator that helps you optimize your sleep quality** ✨

[🚀 Live Demo](#) • [📖 Documentation](#usage) • [🐛 Report Bug](../../issues) • [💡 Request Feature](../../issues)

</div>

---

## 🎯 What Makes This Special?

Unlike basic caffeine calculators, this app provides **personalized insights** based on your age, sex, and weight to give you accurate predictions about how caffeine will affect your sleep.

### 🌟 Key Features

| Feature | Description |
|---------|-------------|
| 🧬 **Personalized Half-Life** | Adjusts caffeine metabolism based on your personal characteristics |
| 📊 **Interactive Charts** | Beautiful Chart.js visualizations showing caffeine decay over 24 hours |
| 📱 **Mobile-First Design** | Responsive Tailwind CSS design that works perfectly on any device |
| 💾 **Smart Data Persistence** | Automatically saves your drinks and personal info locally |
| 📈 **7-Day History Tracking** | Track your caffeine patterns over time |
| ⚠️ **Safety Zones** | Color-coded warnings for safe, caution, and high-risk caffeine levels |
| ⏰ **Individual Cutoff Times** | Calculates when to stop each drink type for optimal sleep |
| 🎯 **Multiple Drink Support** | Track coffee, tea, energy drinks, and more simultaneously |

## 🧪 The Science Behind It

This calculator uses the **scientifically-backed caffeine half-life formula**:

```
Caffeine Remaining = Initial Dose × (0.5)^(hours elapsed / half-life)
```

**Personalization factors:**
- 👤 **Age**: Metabolism slows with age (+0.5-1 hour for 30+)
- ⚖️ **Weight**: Body mass affects distribution (±0.5 hour adjustment)
- 👥 **Sex**: Hormonal differences affect metabolism (+0.5 hour for females)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/cupacity.git
   cd cupacity
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000) 🎉

## 📱 Usage Guide

### Step 1: Enter Personal Information
Fill in your age, sex, and weight for personalized calculations.

### Step 2: Add Your Drinks
- Enter drink names (Coffee, Energy Drink, etc.)
- Input caffeine content in milligrams
- Set consumption times

### Step 3: Set Your Bedtime
Choose when you plan to sleep.

### Step 4: Get Your Results
- See total caffeine remaining at bedtime
- View personalized safety zones
- Check individual drink cutoff times
- Analyze the 24-hour decay chart

## 🛠️ Technology Stack

<div align="center">

| Frontend | Styling | Charts | Development |
|----------|---------|--------|-------------|
| Next.js 14 | Tailwind CSS | Chart.js | TypeScript |
| React 18 | Responsive Design | react-chartjs-2 | ESLint |

</div>

## 📊 Example Results

```
☕ Morning Coffee (200mg) at 8:00 AM
🥤 Energy Drink (160mg) at 2:00 PM
🛏️ Bedtime: 11:00 PM

Results:
✅ Total caffeine at bedtime: 28.4 mg (Safe Zone)
⏰ Coffee cutoff: 3:24 PM
⏰ Energy drink cutoff: Already consumed
📈 Your adjusted half-life: 5.5 hours
```

## 🎯 Roadmap

- [ ] 🎮 Gamification with streaks and achievements
- [ ] 📱 Progressive Web App (PWA) support
- [ ] 🔔 Smart notifications and reminders
- [ ] 🗃️ Preset drink database
- [ ] 😴 Sleep quality correlation tracking
- [ ] 📤 Data export (CSV/PDF)
- [ ] 🌙 Dark mode theme
- [ ] 🤖 AI-powered recommendations

## 📄 License

This project is proprietary and all rights are reserved. The code is not available for public use, modification, or distribution without explicit permission from the author.

## ⚠️ Disclaimer

This app is for **informational and educational purposes only**. Caffeine metabolism varies widely between individuals. Results are estimates based on average scientific data and may not reflect your personal response. 

**This tool does not provide medical advice** and should not replace consultation with a qualified healthcare professional. For most adults, daily intake above 400 mg of caffeine may pose health risks. Use responsibly.

---

<div align="center">

**Made with ☕ and ❤️**

[⭐ Star this repo](../../stargazers) • [🐛 Report issues](../../issues) • [💬 Discussions](../../discussions)

</div>
