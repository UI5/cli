<template>
    <div id="trippin" class="ui5-content-density-compact">
        <div class="u-bar">
            <ui5-title level="H4">Persons ({{ this.count }})</ui5-title>
            <div class="u-bar-singleLineContent space-x-0 md:space-x-2">
                <ui5-input class="w-full md:w-32" ref="searchField" show-clear-icon 
                    @input="handleSearch" @change="handleSearch"
                    placeholder="Search">
                    <ui5-icon id="searchIcon" slot="icon" name="search" />
                </ui5-input>
            </div>
        </div>
        <ui5-list class="full-width" id="personList" ref="list" mode="SingleSelect" 
            :growing="this.growing"
            :busy="this.busy" @load-more="handleLoadMore">
            <ui5-li v-for="person in persons" :key="person.userName" 
                :icon="person.gender === 'Male' ? 'male' : 'female'"
                :additional-text="person.emails[0] ? person.emails[0] : '<unknown>'">
                    {{person.firstName }} {{ person.lastName }}
            </ui5-li>
        </ui5-list>
    </div>
</template>

<script>
// UI5
import { defineComponent, ref } from "vue";
import UI5WebComponentsMixin from "../mixins/UI5WebComponentsMixin.js";
import "@ui5/webcomponents/dist/Title.js";
import "@ui5/webcomponents/dist/Input.js";
import "@ui5/webcomponents/dist/List.js";
import "@ui5/webcomponents/dist/ListItemStandard.js";

// UI5 Icons
import "@ui5/webcomponents-icons/dist/search.js";
import "@ui5/webcomponents-icons/dist/male.js";
import "@ui5/webcomponents-icons/dist/female.js";

// OData model usage
import { TrippinService } from "../model/trippin/TrippinService";
import { QPerson } from "../model/trippin/QTrippin";
import { FetchClient } from "@odata2ts/http-client-fetch";
// use this url to avoid cors issues (supports preflight) !!!
const baseUrl = "https://services.odata.org/Trippin_Staging/(S(iw1anra4xygjyssbeef0yeyy))/"
const httpClient = new FetchClient(undefined, {
    // only relevant for POST/PATCH CSRF support
    useCsrfProtection: true,
    csrfTokenFetchUrl: "/Trippin"
});
const trippinService = new TrippinService(httpClient, baseUrl);

export default defineComponent({
    name: "Trippin",
    mixins: [UI5WebComponentsMixin],
    data() {
        return {
            top: 10,
            skip: 0,
            query: "",
            loading: false,
            lastQuery: null,
            count: null,
            persons: []
        }
    },
    mounted() {
        this.fetchData(false);
    },
    computed: {
        growing() {
            return (this.skip + this.top <= this.count - 1) ? "Button" : "None";
        },
        busy() {
            return this.loading;
        }
    },
    methods: {
        handleSearch: function (event) {
            const query = event.target.getAttribute("value"); 
            const type = event.type;
            // combine change/input to allow change and field reset
            if (type === "change" || type === "input" && query.length === 0) {
                this.query = query;
                this.fetchData(false);
            }
        },
        handleLoadMore: function () {   
            this.skip += this.top;
            this.fetchData(true);
        },
        fetchData: async function (more) {
            this.loading = true;

            // reset if new query
            if (this.lastQuery !== this.query) {
                // reset
                this.persons = [];
                this.skip = 0;
                this.count = 0;
            } else if (!more) {
                this.loading = false;
                return;
            }

            // build filter condition
            let filter;
            if (this.query.length > 0) {
                const qPerson = new QPerson();
                const upperQuery = this.query.toUpperCase();
                filter = qPerson.firstName.toUpper().contains(upperQuery)
                    .or(qPerson.lastName.toUpper().contains(upperQuery))
            }

            // fetch data using api
            const response = await trippinService.people().query((builder) => builder
                .count()
                // error > Value cannot be null.\r\nParameter name: source
                //.select("userName", "firstName", "lastName", "emails")                
                //.search(this.query)
                .filter(filter)
                .orderBy("lastName", "firstName")
                .top(this.top)
                .skip(this.skip)
            );

            if (response.status === 200) {
                this.count = response.data["@odata.count"];
                // append growing data
                this.persons = this.persons.concat(response.data.value);
            }

            this.lastQuery = this.query;
            this.loading = false;
        }
    }
});
</script>