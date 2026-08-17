import { Product } from "./products";

export type LayoutVersion = "v1" | "v2" | "v3" | "semantic";

export function renderStorefront(version: LayoutVersion, products: Product[]) {
  switch (version) {
    case "v1":
      return (
        <div className="product-grid">
          {products.map((p) => (
            <div className="card" key={p.id}>
              <h3>{p.name}</h3>
              <span className="price">₹{p.price}</span>
            </div>
          ))}
        </div>
      );
    case "v2":
      return (
        <div className="products">
          {products.map((p) => (
            <div key={p.id}>
              <h3>{p.name}</h3>
              <div data-test="price"><span className="amount">₹{p.price}</span></div>
            </div>
          ))}
        </div>
      );
    case "v3":
      return (
        <section className="catalog">
          {products.map((p) => (
            <article key={p.id} className="item">
              <header>{p.name}</header>
              <footer>
                <span className="msrp-strike">₹{p.msrp}</span>
                <strong className="now">₹{p.price}</strong>
              </footer>
            </article>
          ))}
        </section>
      );
    case "semantic":
      return (
        <div className="product-grid">
          {products.map((p) => (
            <div className="card" key={p.id}>
              <h3>{p.name}</h3>
              <span className="price">{p.price}</span>
            </div>
          ))}
        </div>
      );
  }
}
