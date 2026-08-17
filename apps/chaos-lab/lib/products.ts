export interface Product {
  id: string;
  name: string;
  price: number; // sale price, INR
  msrp: number;  // struck-through original price, INR
  currency: "INR";
}

export const PRODUCTS: Product[] = [
  { id: "p1", name: "Basmati Rice 5kg", price: 620, msrp: 750, currency: "INR" },
  { id: "p2", name: "Sunflower Oil 1L", price: 185, msrp: 210, currency: "INR" },
  { id: "p3", name: "Toor Dal 1kg", price: 145, msrp: 160, currency: "INR" },
  { id: "p4", name: "Wheat Atta 10kg", price: 480, msrp: 520, currency: "INR" },
  { id: "p5", name: "Tea Powder 500g", price: 210, msrp: 240, currency: "INR" },
];
