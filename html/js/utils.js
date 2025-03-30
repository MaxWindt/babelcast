//// Translation
var translation_de = {
  title: "Live-Audio-Stream",
  // subtitle: "Live-Audio-Stream",
  unsupported_browser:
    "Ihr Webbrowser unterstützt leider kein WebRTC, das für diese Anwendung erforderlich ist. Bitte versuchen Sie einen anderen Webbrowser.",
  channels_header: "Kanäle",
  channels_description:
    "Klicken Sie auf einen Kanalnamen unten, um eine Verbindung herzustellen.",
  no_channels: "Keine Kanäle gefunden",
  switch_channel: "Kanal wechseln",
  span_reload: "Neu laden",
  btn_original: "Direkte Übertragung",
  btn_translation: "Übersetzung",
  powered_by: "Ermöglicht durch",
};

var translation_es = {
  title: "Transmisión de Audio en Vivo",
  // subtitle: "Transmisión de Audio en Vivo",
  unsupported_browser:
    "Desafortunadamente, su navegador web no parece admitir WebRTC, que es necesario para esta aplicación. Por favor, pruebe con otro navegador web.",
  channels_header: "Canales",
  channels_description:
    "Haga clic en un nombre de canal a continuación para conectarse.",
  no_channels: "No se encontraron canales",
  switch_channel: "Cambiar canal",
  span_reload: "recargar",
  btn_translation: "traducción",
  btn_original: "original",
  powered_by: "Proporcionado por",
};

// Function to set translations based on language
function setTranslations(translations) {
  document.getElementById("title").textContent = translations["title"];
  // document.getElementById("subtitle").textContent = translations["subtitle"];
  document.getElementById("unsupported_browser").textContent =
    translations["unsupported_browser"];
  document.getElementById("channels_description").textContent =
    translations["channels_description"];
  document.getElementById("nochannels").textContent =
    translations["no_channels"];
  document.getElementById("powered_by").textContent =
    translations["powered_by"];
  // Check if the original button is available
  const originalButton = document.getElementById("btn_original");
  if (originalButton) {
    originalButton.textContent = translations["btn_original"];
  }

  // Check if the translation button is available
  const translationButton = document.getElementById("btn_translation");
  if (translationButton) {
    translationButton.textContent = translations["btn_translation"];
  }

  const reloadButton = document.getElementById("span_reload");
  if (reloadButton) {
    reloadButton.textContent = translations["span_reload"];
  }
}
function translate_text() {
  // Check if the language starts with "de" (for German)
  if (navigator.language.startsWith("de")) {
    setTranslations(translation_de);
  }
  // // Check if the language starts with "es" (for Spanish)
  // else if (navigator.language.startsWith("es")) {
  //   setTranslations(translation_es);
  // }
}
//// Team Members
function createGalleryItems() {
  const galleryDiv = document.querySelector(".gallery");
  galleryDiv.innerHTML = teamMembers
    .sort(() => Math.random() - 0.5)
    .map(
      (member, index) => `
        <div class="gallery-item">
            <img data-src="https://picsum.photos/200/200?random=${index + 1}" 
                 src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                 alt="${member.name}" />
            <div class="gallery-text">
                <div class="name">${member.name}</div>
                <div class="title">${member.title}</div>
            </div>
        </div>
    `
    )
    .join("");
}

function loadGalleryImages() {
  const images = document.querySelectorAll(".gallery-item img");
  images.forEach((img) => {
    if (img.dataset.src) {
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    }
  });
}

function openGallery() {
  document.getElementById("galleryModal").style.display = "block";
  document.body.style.overflow = "hidden";
  loadGalleryImages();
}

function closeGallery() {
  document.getElementById("galleryModal").style.display = "none";
  document.body.style.overflow = "auto";
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  createGalleryItems();

  window.onclick = function (event) {
    if (event.target == document.getElementById("galleryModal")) {
      closeGallery();
    }
  };

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeGallery();
    }
  });
});

// Make functions available globally
window.openGallery = openGallery;
window.closeGallery = closeGallery;
