"use strict";

/* ==========================================================
   NOOLTHARI™
   Coming Soon
========================================================== */

document.addEventListener(

    "DOMContentLoaded",

    ()=>{

        console.clear();

        console.log(

            "%cNOOLTHARI™",

            "font-size:24px;font-weight:bold;color:#C79A34;"

        );

        console.log(

            "Premium Sarees"

        );

        document.title=

        "NOOLTHARI™ | Coming Soon";

        // Current Year

        const footer=

        document.querySelector(

            "footer"

        );

        if(footer){

            footer.innerHTML=

            `© ${new Date().getFullYear()} NOOLTHARI™<br>All Rights Reserved.`;

        }

    }

);