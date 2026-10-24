// Cities named on the Trace maps for orientation (the maps have no tiles): [name, lat, lng, rank].
// Rank 1 shows first as you zoom in, rank 3 only close in. Positions rounded to 0.01°.

export const CITIES: [string, number, number, 1 | 2 | 3][] = [
  // Europe
  ['London', 51.51, -0.13, 1], ['Paris', 48.86, 2.35, 1], ['Berlin', 52.52, 13.4, 1], ['Madrid', 40.42, -3.7, 1], ['Rome', 41.9, 12.5, 1], ['Moscow', 55.76, 37.62, 1],
  ['Istanbul', 41.01, 28.98, 1], ['Kyiv', 50.45, 30.52, 2], ['Warsaw', 52.23, 21.01, 2], ['Vienna', 48.21, 16.37, 2], ['Prague', 50.08, 14.44, 2], ['Budapest', 47.5, 19.04, 2],
  ['Amsterdam', 52.37, 4.9, 2], ['Brussels', 50.85, 4.35, 2], ['Lisbon', 38.72, -9.14, 2], ['Barcelona', 41.39, 2.17, 2], ['Milan', 45.46, 9.19, 2], ['Munich', 48.14, 11.58, 2],
  ['Hamburg', 53.55, 9.99, 2], ['Stockholm', 59.33, 18.07, 2], ['Oslo', 59.91, 10.75, 2], ['Copenhagen', 55.68, 12.57, 2], ['Helsinki', 60.17, 24.94, 2], ['Dublin', 53.35, -6.26, 2],
  ['Athens', 37.98, 23.73, 2], ['Bucharest', 44.43, 26.1, 2], ['Zurich', 47.38, 8.54, 2], ['Lyon', 45.76, 4.84, 3], ['Marseille', 43.3, 5.37, 3], ['Toulouse', 43.6, 1.44, 3],
  ['Bordeaux', 44.84, -0.58, 3], ['Lille', 50.63, 3.06, 3], ['Nantes', 47.22, -1.55, 3], ['Nice', 43.71, 7.26, 3], ['Strasbourg', 48.57, 7.75, 3], ['Valencia', 39.47, -0.38, 3],
  ['Seville', 37.39, -5.98, 3], ['Bilbao', 43.26, -2.93, 3], ['Porto', 41.15, -8.61, 3], ['Turin', 45.07, 7.69, 3], ['Naples', 40.85, 14.27, 3], ['Florence', 43.77, 11.26, 3],
  ['Frankfurt', 50.11, 8.68, 3], ['Cologne', 50.94, 6.96, 3], ['Rotterdam', 51.92, 4.48, 3], ['Antwerp', 51.22, 4.4, 3], ['Geneva', 46.2, 6.14, 3], ['Manchester', 53.48, -2.24, 3],
  ['Birmingham', 52.49, -1.9, 3], ['Glasgow', 55.86, -4.25, 3], ['Edinburgh', 55.95, -3.19, 3], ['Kraków', 50.06, 19.94, 3], ['Belgrade', 44.79, 20.45, 3], ['Sofia', 42.7, 23.32, 3],
  ['Zagreb', 45.81, 15.98, 3], ['Riga', 56.95, 24.11, 3], ['Vilnius', 54.69, 25.28, 3], ['Minsk', 53.9, 27.56, 3], ['Saint Petersburg', 59.93, 30.34, 2], ['Gothenburg', 57.71, 11.97, 3],
  // Middle East and Africa
  ['Cairo', 30.04, 31.24, 1], ['Lagos', 6.52, 3.38, 1], ['Johannesburg', -26.2, 28.05, 1], ['Nairobi', -1.29, 36.82, 2], ['Casablanca', 33.57, -7.59, 2], ['Algiers', 36.75, 3.06, 2],
  ['Tunis', 36.81, 10.18, 3], ['Accra', 5.6, -0.19, 2], ['Dakar', 14.72, -17.47, 2], ['Addis Ababa', 9.03, 38.74, 2], ['Kinshasa', -4.44, 15.27, 2], ['Luanda', -8.84, 13.23, 3],
  ['Cape Town', -33.92, 18.42, 2], ['Dar es Salaam', -6.79, 39.21, 3], ['Khartoum', 15.5, 32.56, 3], ['Abidjan', 5.36, -4.01, 3], ['Marrakesh', 31.63, -8.01, 3], ['Tangier', 35.76, -5.83, 3],
  ['Dubai', 25.2, 55.27, 1], ['Riyadh', 24.71, 46.68, 2], ['Jeddah', 21.49, 39.19, 3], ['Doha', 25.29, 51.53, 3], ['Abu Dhabi', 24.45, 54.38, 3], ['Tehran', 35.69, 51.39, 1],
  ['Baghdad', 33.31, 44.37, 2], ['Tel Aviv', 32.09, 34.78, 3], ['Amman', 31.95, 35.93, 3], ['Beirut', 33.89, 35.5, 3], ['Ankara', 39.93, 32.86, 2], ['Kuwait City', 29.38, 47.99, 3],
  ['Muscat', 23.59, 58.41, 3],
  // Asia
  ['Mumbai', 19.08, 72.88, 1], ['Delhi', 28.61, 77.21, 1], ['Bengaluru', 12.97, 77.59, 2], ['Chennai', 13.08, 80.27, 2], ['Kolkata', 22.57, 88.36, 2], ['Hyderabad', 17.39, 78.49, 2],
  ['Pune', 18.52, 73.86, 3], ['Ahmedabad', 23.02, 72.57, 3], ['Jaipur', 26.91, 75.79, 3], ['Lucknow', 26.85, 80.95, 3], ['Kochi', 9.93, 76.27, 3], ['Karachi', 24.86, 67.0, 1],
  ['Lahore', 31.55, 74.34, 2], ['Islamabad', 33.68, 73.05, 3], ['Dhaka', 23.81, 90.41, 1], ['Kathmandu', 27.72, 85.32, 3], ['Colombo', 6.93, 79.86, 3], ['Tashkent', 41.3, 69.24, 3],
  ['Almaty', 43.24, 76.89, 3], ['Beijing', 39.9, 116.41, 1], ['Shanghai', 31.23, 121.47, 1], ['Guangzhou', 23.13, 113.26, 2], ['Shenzhen', 22.54, 114.06, 2], ['Hong Kong', 22.32, 114.17, 2],
  ['Chengdu', 30.57, 104.07, 2], ['Wuhan', 30.59, 114.31, 3], ['Xi’an', 34.34, 108.94, 3], ['Chongqing', 29.56, 106.55, 3], ['Tokyo', 35.68, 139.69, 1], ['Osaka', 34.69, 135.5, 2],
  ['Seoul', 37.57, 126.98, 1], ['Busan', 35.18, 129.08, 3], ['Taipei', 25.03, 121.57, 2], ['Manila', 14.6, 120.98, 1], ['Bangkok', 13.76, 100.5, 1], ['Hanoi', 21.03, 105.85, 2],
  ['Ho Chi Minh City', 10.82, 106.63, 2], ['Kuala Lumpur', 3.14, 101.69, 2], ['Singapore', 1.35, 103.82, 1], ['Jakarta', -6.21, 106.85, 1], ['Surabaya', -7.25, 112.75, 3], ['Yangon', 16.87, 96.2, 3],
  ['Ulaanbaatar', 47.89, 106.91, 3], ['Novosibirsk', 55.01, 82.93, 3], ['Vladivostok', 43.12, 131.89, 3],
  // Oceania
  ['Sydney', -33.87, 151.21, 1], ['Melbourne', -37.81, 144.96, 2], ['Brisbane', -27.47, 153.03, 3], ['Perth', -31.95, 115.86, 2], ['Adelaide', -34.93, 138.6, 3], ['Auckland', -36.85, 174.76, 2],
  // Americas
  ['New York', 40.71, -74.01, 1], ['Los Angeles', 34.05, -118.24, 1], ['Chicago', 41.88, -87.63, 1], ['Toronto', 43.65, -79.38, 1], ['Mexico City', 19.43, -99.13, 1], ['São Paulo', -23.55, -46.63, 1],
  ['Buenos Aires', -34.6, -58.38, 1], ['Rio de Janeiro', -22.91, -43.17, 2], ['Lima', -12.05, -77.04, 2], ['Bogotá', 4.71, -74.07, 2], ['Santiago', -33.45, -70.67, 2], ['Caracas', 10.48, -66.9, 3],
  ['Houston', 29.76, -95.37, 2], ['Dallas', 32.78, -96.8, 2], ['Miami', 25.76, -80.19, 2], ['Atlanta', 33.75, -84.39, 2], ['San Francisco', 37.77, -122.42, 2], ['Seattle', 47.61, -122.33, 2],
  ['Washington', 38.91, -77.04, 2], ['Boston', 42.36, -71.06, 2], ['Philadelphia', 39.95, -75.17, 3], ['Phoenix', 33.45, -112.07, 3], ['Denver', 39.74, -104.99, 3], ['Detroit', 42.33, -83.05, 3],
  ['Minneapolis', 44.98, -93.27, 3], ['Las Vegas', 36.17, -115.14, 3], ['San Diego', 32.72, -117.16, 3], ['Montreal', 45.5, -73.57, 2], ['Vancouver', 49.28, -123.12, 2], ['Calgary', 51.05, -114.07, 3],
  ['Ottawa', 45.42, -75.7, 3], ['Guadalajara', 20.66, -103.35, 3], ['Monterrey', 25.69, -100.32, 3], ['Havana', 23.11, -82.37, 3], ['Panama City', 8.98, -79.52, 3], ['Quito', -0.18, -78.47, 3],
  ['Brasília', -15.79, -47.88, 3], ['Salvador', -12.97, -38.5, 3], ['Belo Horizonte', -19.92, -43.94, 3], ['Montevideo', -34.9, -56.16, 3], ['Medellín', 6.24, -75.58, 3],
];
