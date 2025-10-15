// components/illustrations/BarberIllustrations.js
import React from 'react';

// You can use these SVG components as placeholders until you get real illustrations
// Simply import them in your OnboardingSlides.js file:
// import { BarberChairIllustration, HaircutIllustration, BookingIllustration } from '../illustrations/BarberIllustrations';

export const BarberChairIllustration = () => (
  <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="90" fill="#F2F2F2"/>
    <rect x="70" y="100" width="60" height="80" rx="5" fill="#6B4226"/>
    <rect x="70" y="95" width="60" height="10" rx="5" fill="#8B5A2B"/>
    <rect x="75" y="105" width="50" height="70" rx="3" fill="#A0522D"/>
    <rect x="85" y="50" width="30" height="50" rx="5" fill="#8B5A2B"/>
    <path d="M85 60C85 57.2386 87.2386 55 90 55H110C112.761 55 115 57.2386 115 60V70C115 72.7614 112.761 75 110 75H90C87.2386 75 85 72.7614 85 70V60Z" fill="#A0522D"/>
    <rect x="60" y="110" width="10" height="30" rx="2" fill="#8B5A2B"/>
    <rect x="130" y="110" width="10" height="30" rx="2" fill="#8B5A2B"/>
    <path d="M60 180H140" stroke="#6B4226" strokeWidth="5" strokeLinecap="round"/>
    <circle cx="75" cy="115" r="3" fill="#D4B068"/>
    <circle cx="95" cy="115" r="3" fill="#D4B068"/>
    <circle cx="105" cy="115" r="3" fill="#D4B068"/>
    <circle cx="125" cy="115" r="3" fill="#D4B068"/>
    <circle cx="75" cy="135" r="3" fill="#D4B068"/>
    <circle cx="95" cy="135" r="3" fill="#D4B068"/>
    <circle cx="105" cy="135" r="3" fill="#D4B068"/>
    <circle cx="125" cy="135" r="3" fill="#D4B068"/>
  </svg>
);

export const HaircutIllustration = () => (
  <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="90" fill="#F2F2F2"/>
    <circle cx="100" cy="80" r="40" fill="#6B4226"/>
    <path d="M70 110C70 110 80 150 100 150C120 150 130 110 130 110" fill="#A0522D"/>
    <circle cx="100" cy="75" r="30" fill="#D4B068"/>
    <path d="M85 65C85 65 90 60 100 60C110 60 115 65 115 65" stroke="#6B4226" strokeWidth="2"/>
    <circle cx="90" cy="75" r="3" fill="#6B4226"/>
    <circle cx="110" cy="75" r="3" fill="#6B4226"/>
    <path d="M90 90C90 90 95 95 100 95C105 95 110 90 110 90" stroke="#6B4226" strokeWidth="2"/>
    <path d="M70 130L60 140" stroke="#6B4226" strokeWidth="3"/>
    <path d="M130 130L140 140" stroke="#6B4226" strokeWidth="3"/>
    <path d="M150 60C150 60 160 70 150 80" stroke="#6B4226" strokeWidth="3"/>
    <path d="M50 60C50 60 40 70 50 80" stroke="#6B4226" strokeWidth="3"/>
    <circle cx="150" cy="75" r="10" fill="#D4B068"/>
    <circle cx="50" cy="75" r="10" fill="#D4B068"/>
    <path d="M145 70L155 80" stroke="#6B4226" strokeWidth="2"/>
    <path d="M155 70L145 80" stroke="#6B4226" strokeWidth="2"/>
    <path d="M45 70L55 80" stroke="#6B4226" strokeWidth="2"/>
    <path d="M55 70L45 80" stroke="#6B4226" strokeWidth="2"/>
  </svg>
);

export const BookingIllustration = () => (
  <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="90" fill="#F2F2F2"/>
    <rect x="60" y="60" width="80" height="100" rx="5" fill="#6B4226"/>
    <rect x="65" y="65" width="70" height="90" rx="3" fill="#D4B068"/>
    <rect x="70" y="75" width="60" height="10" rx="2" fill="#6B4226"/>
    <rect x="70" y="95" width="60" height="10" rx="2" fill="#6B4226"/>
    <rect x="70" y="115" width="60" height="10" rx="2" fill="#6B4226"/>
    <rect x="70" y="135" width="30" height="10" rx="2" fill="#6B4226"/>
    <circle cx="140" cy="70" r="20" fill="#A0522D"/>
    <text x="135" y="75" fontSize="20" fill="#D4B068">✓</text>
    <circle cx="85" cy="145" r="5" fill="#A0522D"/>
    <circle cx="100" cy="145" r="5" fill="#A0522D"/>
    <circle cx="115" cy="145" r="5" fill="#A0522D"/>
  </svg>
);

export default {
  BarberChairIllustration,
  HaircutIllustration,
  BookingIllustration
};