(function () {

    const DEFAULT_BRAND = {
        name: " ",
        address: " ",
        phone: " ",
        gst: " ",
        logo: ""
    };

    function getBrand() {
        if (!window.APP_SETTINGS) return DEFAULT_BRAND;

        return {
            name: APP_SETTINGS.COMPANY_NAME || DEFAULT_BRAND.name,
            address: `${APP_SETTINGS.ADDRESS_LINE_1 || ""}<br>${APP_SETTINGS.ADDRESS_LINE_2 || ""}`,
            phone: APP_SETTINGS.CONTACT_NUMBER || "",
            gst: APP_SETTINGS.GST_NUMBER || "",
            logo: APP_SETTINGS.LOGO_PATH || ""
        };
    }

    function applyBrand() {
        const b = getBrand();

        document.querySelectorAll("[data-brand='name']")
            .forEach(e => e.innerHTML = b.name);

        document.querySelectorAll("[data-brand='address']")
            .forEach(e => e.innerHTML = b.address);

        document.querySelectorAll("[data-brand='phone']")
            .forEach(e => e.innerHTML = b.phone);

        document.querySelectorAll("[data-brand='gst']")
            .forEach(e => e.innerHTML = b.gst);

        document.querySelectorAll("[data-brand='logo']")
            .forEach(e => {
                if (b.logo) e.src = b.logo;
                else e.style.display = "none";
            });

        document.title = b.name || document.title;
    }

    window.BrandService = { applyBrand };

})();
