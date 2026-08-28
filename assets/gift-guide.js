import { CartLinesUpdateEvent } from '@shopify/events';

/**
 * ============================================================
 * Gift Guide — Interactive Logic (Vanilla JS, no jQuery)
 * ============================================================
 *
 * Handles:
 *   1. Product popup open / close
 *   2. Colour-variant selection (tab UI)
 *   3. Size-variant selection (dropdown UI)
 *   4. Add to Cart via Shopify /cart/add.js
 *   5. Auto-add "Soft Winter Jacket" when Black + M variant is selected
 *
 * Data flow:
 *   Each grid item stores a product handle in `data-product-handle`.
 *   On popup open we fetch `/products/{handle}.json` to get live
 *   variant data, then render colour + size options dynamically.
 *
 * ============================================================
 */

/* ── Constants ──────────────────────────────────────────── */
const SOFT_WINTER_JACKET_HANDLE = 'dark-winter-jacket';

/* ── DOM references (set once after DOM ready) ─────────── */
let overlay, popup, closeBtn, popupImage, popupName, popupPrice,
    popupDesc, colorContainer, sizeTrigger, sizeOptions, atcBtn,
    statusEl, gridItems;

/* ── Active state ──────────────────────────────────────── */
let currentProduct   = null;   // Full product JSON
let selectedColor    = null;
let selectedSize     = null;

/* ============================================================
 * Initialisation
 * ============================================================ */
document.addEventListener('DOMContentLoaded', init);

function init() {
  /* Cache DOM nodes */
  overlay        = document.getElementById('gg-popup-overlay');
  popup          = document.getElementById('gg-popup');
  closeBtn       = document.getElementById('gg-popup-close');
  popupImage     = document.getElementById('gg-popup-image');
  popupName      = document.getElementById('gg-popup-name');
  popupPrice     = document.getElementById('gg-popup-price');
  popupDesc      = document.getElementById('gg-popup-desc');
  colorContainer = document.getElementById('gg-popup-colors');
  sizeTrigger    = document.getElementById('gg-popup-size-trigger');
  sizeOptions    = document.getElementById('gg-popup-size-options');
  atcBtn         = document.getElementById('gg-popup-atc');
  statusEl       = document.getElementById('gg-popup-status');
  gridItems      = document.querySelectorAll('.gg-grid__item-icon');

  if (!popup) return; // Section not present on this page

  bindEvents();
}

/* ============================================================
 * Event Binding
 * ============================================================ */
function bindEvents() {
  /* Open popup when any "+" icon is clicked */
  gridItems.forEach(function (icon) {
    icon.addEventListener('click', function (e) {
      e.stopPropagation();
      var handle = this.closest('.gg-grid__item').dataset.productHandle;
      if (handle) openPopup(handle);
    });
  });

  /* Also allow clicking the grid image itself */
  document.querySelectorAll('.gg-grid__item').forEach(function (item) {
    item.addEventListener('click', function () {
      var handle = this.dataset.productHandle;
      if (handle) openPopup(handle);
    });
  });

  /* Close popup */
  if (closeBtn) closeBtn.addEventListener('click', closePopup);
  if (overlay) overlay.addEventListener('click', closePopup);

  /* Size dropdown toggle */
  if (sizeTrigger) sizeTrigger.addEventListener('click', toggleSizeDropdown);

  /* Add to Cart */
  if (atcBtn) atcBtn.addEventListener('click', handleAddToCart);

  /* Close popup on Escape key */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePopup();
  });
}

/* ============================================================
 * Popup — Open / Close
 * ============================================================ */

/**
 * Fetches product data from the Shopify Products JSON endpoint
 * and populates the popup with its details.
 *
 * @param {string} handle — Product handle (URL slug)
 */
function openPopup(handle) {
  /* Show loading state */
  setStatus('Loading…', '');
  showPopup();

  fetch('/products/' + handle + '.json')
    .then(function (res) {
      if (!res.ok) throw new Error('Product not found');
      return res.json();
    })
    .then(function (data) {
      currentProduct = data.product;
      renderPopup(currentProduct);
      setStatus('', '');
    })
    .catch(function (err) {
      console.error('[Gift Guide] Product fetch failed:', err);
      setStatus('Unable to load product.', 'error');
    });
}

/** Shows the overlay + popup container */
function showPopup() {
  if (overlay) overlay.classList.add('is-active');
  if (popup)   popup.classList.add('is-active');
  document.body.style.overflow = 'hidden'; // prevent background scroll
}

/** Hides the popup and resets state */
function closePopup() {
  if (overlay) overlay.classList.remove('is-active');
  if (popup)   popup.classList.remove('is-active');
  document.body.style.overflow = '';
  currentProduct = null;
  selectedColor  = null;
  selectedSize   = null;
}

/* ============================================================
 * Popup — Render Product Data
 * ============================================================ */

/**
 * Populates all popup fields with product data and builds
 * the colour + size variant selectors dynamically.
 *
 * @param {Object} product — Shopify product object
 */
function renderPopup(product) {
  /* Basic info */
  popupImage.src   = product.image ? product.image.src : '';
  popupImage.alt   = product.title;
  popupName.textContent  = product.title;
  popupPrice.textContent = formatMoney(product.variants[0].price);

  /* Strip HTML tags from body_html for plain-text description */
  popupDesc.textContent = stripHtml(product.body_html || '');

  /* Build variant selectors from options */
  buildColorSelector(product);
  buildSizeSelector(product);
}

/* ── Colour Selector ───────────────────────────────────── */

/**
 * Builds the colour tab buttons from the product's "Color" option.
 * Each button shows a small swatch + label.
 */
function buildColorSelector(product) {
  colorContainer.innerHTML = '';
  selectedColor = null;

  var colorOption = getOption(product, 'Color');
  if (!colorOption) {
    /* No colour option — hide section */
    colorContainer.parentElement.style.display = 'none';
    return;
  }

  colorContainer.parentElement.style.display = '';

  colorOption.values.forEach(function (color, idx) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gg-popup__color-btn';
    btn.dataset.color = color;

    /* Swatch */
    var swatch = document.createElement('span');
    swatch.className = 'gg-popup__color-swatch';
    swatch.style.backgroundColor = colorToHex(color);
    btn.appendChild(swatch);

    /* Label */
    var label = document.createElement('span');
    label.textContent = color;
    btn.appendChild(label);

    /* Pre-select first colour */
    if (idx === 0) {
      btn.classList.add('is-selected');
      selectedColor = color;
    }

    btn.addEventListener('click', function () {
      selectColor(this, color);
    });

    colorContainer.appendChild(btn);
  });
}

/**
 * Handles colour button selection — toggles active state.
 */
function selectColor(btn, color) {
  colorContainer.querySelectorAll('.gg-popup__color-btn').forEach(function (b) {
    b.classList.remove('is-selected');
  });
  btn.classList.add('is-selected');
  selectedColor = color;
  setStatus('', '');
}

/* ── Size Selector ─────────────────────────────────────── */

/**
 * Builds the size dropdown options from the product's "Size" option.
 */
function buildSizeSelector(product) {
  sizeOptions.innerHTML = '';
  selectedSize = null;

  var sizeOption = getOption(product, 'Size');
  if (!sizeOption) {
    sizeTrigger.parentElement.style.display = 'none';
    return;
  }

  sizeTrigger.parentElement.style.display = '';

  /* Reset trigger text */
  sizeTrigger.querySelector('.gg-popup__size-trigger-text').textContent = 'Choose your size';

  sizeOption.values.forEach(function (size) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gg-popup__size-option';
    btn.textContent = size;
    btn.addEventListener('click', function () {
      selectSize(this, size);
    });
    sizeOptions.appendChild(btn);
  });

  /* Close the dropdown by default */
  sizeOptions.classList.remove('is-open');
  sizeTrigger.classList.remove('is-open');
}

/** Opens / closes the size dropdown */
function toggleSizeDropdown(e) {
  e.stopPropagation();
  sizeTrigger.classList.toggle('is-open');
  sizeOptions.classList.toggle('is-open');
}

/**
 * Handles size option selection — highlights the chosen size
 * and closes the dropdown.
 */
function selectSize(btn, size) {
  sizeOptions.querySelectorAll('.gg-popup__size-option').forEach(function (b) {
    b.classList.remove('is-selected');
  });
  btn.classList.add('is-selected');
  selectedSize = size;
  sizeTrigger.querySelector('.gg-popup__size-trigger-text').textContent = size;
  sizeOptions.classList.remove('is-open');
  sizeTrigger.classList.remove('is-open');
  setStatus('', '');
}

/* Close size dropdown when clicking elsewhere */
document.addEventListener('click', function () {
  var trigger = document.getElementById('gg-popup-size-trigger');
  var options = document.getElementById('gg-popup-size-options');
  if (trigger) trigger.classList.remove('is-open');
  if (options) options.classList.remove('is-open');
});

/* ============================================================
 * Add to Cart
 * ============================================================ */

/**
 * Resolves the correct variant ID from the selected colour + size
 * and POSTs to /cart/add.js. If the variant is Black + Medium,
 * the "Soft Winter Jacket" is also automatically added.
 */
function handleAddToCart() {
  if (!currentProduct) return;

  /* Validate selections */
  var hasColor = !!getOption(currentProduct, 'Color');
  var hasSize  = !!getOption(currentProduct, 'Size');

  if (hasColor && !selectedColor) {
    setStatus('Please select a colour.', 'error');
    return;
  }
  if (hasSize && !selectedSize) {
    setStatus('Please select a size.', 'error');
    return;
  }

  /* Find the matching variant */
  var variant = findVariant(currentProduct, selectedColor, selectedSize);
  if (!variant) {
    setStatus('Selected combination is unavailable.', 'error');
    return;
  }

  /* Disable button during request */
  atcBtn.disabled = true;
  setStatus('Adding to cart…', '');

  addToCart(variant.id, 1)
    .then(function () {
      setStatus('Added to cart!', 'success');
      closePopup(); // Close the popup so they can see the cart drawer open

      /*
       * ── SPECIAL RULE ──────────────────────────────────
       * If the variant being added has Color = Black AND
       * Size = M (Medium), also auto-add the "Soft Winter
       * Jacket" (handle: dark-winter-jacket) to the cart.
       * ──────────────────────────────────────────────────
       */
      if (
        selectedColor &&
        selectedColor.toLowerCase() === 'black' &&
        selectedSize &&
        selectedSize.toUpperCase() === 'M'
      ) {
        return autoAddSoftWinterJacket();
      }
    })
    .then(function () {
      atcBtn.disabled = false;
    })
    .catch(function (err) {
      console.error('[Gift Guide] Add-to-cart error:', err);
      setStatus('Could not add to cart. Try again.', 'error');
      atcBtn.disabled = false;
    });
}

/**
 * POSTs a single item to /cart/add.js via the Fetch API.
 * Dispatches Dawn's CartLinesUpdateEvent so the cart drawer automatically opens.
 *
 * @param {number} variantId — Shopify variant ID
 * @param {number} qty       — Quantity to add
 * @returns {Promise}
 */
function addToCart(variantId, qty) {
  var deferredEventPromise = CartLinesUpdateEvent.createPromise();
  
  // Dispatch the event that Dawn listens to.
  document.dispatchEvent(
    new CartLinesUpdateEvent({
      action: 'add',
      context: 'product',
      lines: [{ merchandiseId: variantId.toString(), quantity: qty }],
      promise: deferredEventPromise.promise,
    })
  );

  var cartItemsComponents = document.querySelectorAll('cart-items-component');
  var cartItemComponentsSectionIds = [];
  cartItemsComponents.forEach(function (item) {
    if (item.dataset.sectionId) {
      cartItemComponentsSectionIds.push(item.dataset.sectionId);
    }
  });

  return fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      id: variantId,
      quantity: qty,
      sections: cartItemComponentsSectionIds.join(',')
    })
  })
    .then(function (res) {
      if (!res.ok) throw new Error('Cart API error');
      return res.json();
    })
    .then(function (addResponse) {
      // Fetch full cart because createCartFromAjaxResponse expects a full cart object, not a cart item.
      return fetch('/cart.js')
        .then(function (cartRes) {
          return cartRes.json();
        })
        .then(function (cartJson) {
          // Resolve the event so the cart drawer updates with the new sections
          deferredEventPromise.resolve({
            cart: CartLinesUpdateEvent.createCartFromAjaxResponse ? CartLinesUpdateEvent.createCartFromAjaxResponse(cartJson) : cartJson,
            detail: {
              items: cartJson.items || [],
              source: 'gift-guide-popup',
              itemCount: qty,
              sections: addResponse.sections || {},
              didError: false
            }
          });
          return addResponse;
        });
    });
}

/**
 * Fetches the "Soft Winter Jacket" product and adds the first
 * available variant to the cart automatically.
 *
 * @returns {Promise}
 */
function autoAddSoftWinterJacket() {
  return fetch('/products/' + SOFT_WINTER_JACKET_HANDLE + '.json')
    .then(function (res) {
      if (!res.ok) throw new Error('Soft Winter Jacket not found');
      return res.json();
    })
    .then(function (data) {
      var product  = data.product;
      /* Pick the first variant that is available */
      var variant = product.variants.find(function (v) {
        return v.available !== false;
      }) || product.variants[0];

      return addToCart(variant.id, 1);
    })
    .then(function () {
      console.log('[Gift Guide] Auto-added Soft Winter Jacket bonus!');
    })
    .catch(function (err) {
      console.error('[Gift Guide] Auto-add Soft Winter Jacket failed:', err);
      /* Non-blocking — the primary add still succeeded */
    });
}

/* ============================================================
 * Helpers
 * ============================================================ */

/**
 * Returns a product option object by name (e.g. "Color", "Size").
 */
function getOption(product, name) {
  return product.options.find(function (o) {
    return o.name.toLowerCase() === name.toLowerCase();
  }) || null;
}

/**
 * Finds the variant matching the given colour + size selections.
 * Matches against option1 / option2 fields on each variant.
 *
 * @returns {Object|null} — Shopify variant object or null
 */
function findVariant(product, color, size) {
  return product.variants.find(function (v) {
    var matchColor = !color || v.option1 === color || v.option2 === color;
    var matchSize  = !size  || v.option1 === size  || v.option2 === size;
    return matchColor && matchSize;
  }) || null;
}

/**
 * Formats a Shopify price (in cents string or dollars string)
 * into a human-readable string.
 */
function formatMoney(price) {
  var amount = parseFloat(price);
  if (isNaN(amount)) return price;
  return '$' + amount.toFixed(2);
}

/**
 * Strips HTML tags from a string, returning plain text.
 */
function stripHtml(html) {
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

/**
 * Maps common colour names to hex values for swatches.
 * Falls back to a neutral grey for unknown colours.
 */
function colorToHex(name) {
  var map = {
    black: '#000000',
    white: '#FFFFFF',
    red:   '#B20F36',
    blue:  '#0D499F',
    grey:  '#AFAFB7',
    gray:  '#AFAFB7',
    green: '#2E7D32',
    navy:  '#001f3f'
  };
  return map[name.toLowerCase()] || '#CCCCCC';
}

/**
 * Displays a status message below the ATC button.
 *
 * @param {string} msg  — Message text
 * @param {string} type — 'success', 'error', or '' (neutral)
 */
function setStatus(msg, type) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = 'gg-popup__status';
  if (type) statusEl.classList.add('gg-popup__status--' + type);
}
