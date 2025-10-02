import { qStringCollection, qEnumCollection } from "@odata2ts/odata-query-objects";
import { ODataService, EntityTypeServiceV4, CollectionServiceV4, EntitySetServiceV4 } from "@odata2ts/odata-service";
import { QPersonId, QAirlineId, QAirportId, QGetPersonWithMostFriends, QGetNearestAirport, QResetDataSource, qPerson, qLocation, QTripId, Person_QGetFavoriteAirline, Person_QGetFriendsTrips, Person_QUpdateLastName, Person_QShareTrip, qAirline, qAirport, qTrip, QPlanItemId, Trip_QGetInvolvedPeople, qPlanItem, qEvent, qPublicTransportation, qFlight, qEmployee, qManager, qCity, qAirportLocation, qEventLocation } from "./QTrippin";
export class TrippinService extends ODataService {
    _me;
    _qGetPersonWithMostFriends;
    _qGetNearestAirport;
    _qResetDataSource;
    people(id) {
        const fieldName = "People";
        const { client, path } = this.__base;
        return typeof id === "undefined" || id === null
            ? new PersonCollectionService(client, path, fieldName)
            : new PersonService(client, path, new QPersonId(fieldName).buildUrl(id));
    }
    airlines(id) {
        const fieldName = "Airlines";
        const { client, path } = this.__base;
        return typeof id === "undefined" || id === null
            ? new AirlineCollectionService(client, path, fieldName)
            : new AirlineService(client, path, new QAirlineId(fieldName).buildUrl(id));
    }
    airports(id) {
        const fieldName = "Airports";
        const { client, path } = this.__base;
        return typeof id === "undefined" || id === null
            ? new AirportCollectionService(client, path, fieldName)
            : new AirportService(client, path, new QAirportId(fieldName).buildUrl(id));
    }
    me() {
        if (!this._me) {
            const { client, path } = this.__base;
            this._me = new PersonService(client, path, "Me");
        }
        return this._me;
    }
    async getPersonWithMostFriends(requestConfig) {
        if (!this._qGetPersonWithMostFriends) {
            this._qGetPersonWithMostFriends = new QGetPersonWithMostFriends();
        }
        const { addFullPath, client, getDefaultHeaders } = this.__base;
        const url = addFullPath(this._qGetPersonWithMostFriends.buildUrl());
        const response = await client.get(url, requestConfig, getDefaultHeaders());
        return this._qGetPersonWithMostFriends.convertResponse(response);
    }
    async getNearestAirport(params, requestConfig) {
        if (!this._qGetNearestAirport) {
            this._qGetNearestAirport = new QGetNearestAirport();
        }
        const { addFullPath, client, getDefaultHeaders } = this.__base;
        const url = addFullPath(this._qGetNearestAirport.buildUrl(params));
        const response = await client.get(url, requestConfig, getDefaultHeaders());
        return this._qGetNearestAirport.convertResponse(response);
    }
    async resetDataSource(requestConfig) {
        if (!this._qResetDataSource) {
            this._qResetDataSource = new QResetDataSource();
        }
        const { addFullPath, client, getDefaultHeaders } = this.__base;
        const url = addFullPath(this._qResetDataSource.buildUrl());
        return client.post(url, {}, requestConfig, getDefaultHeaders());
    }
}
export class PersonService extends EntityTypeServiceV4 {
    _emails;
    _addressInfo;
    _homeAddress;
    _features;
    _bestFriend;
    _personQGetFavoriteAirline;
    _personQGetFriendsTrips;
    _personQUpdateLastName;
    _personQShareTrip;
    constructor(client, basePath, name) {
        super(client, basePath, name, qPerson);
    }
    emails() {
        if (!this._emails) {
            const { client, path } = this.__base;
            this._emails = new CollectionServiceV4(client, path, "Emails", qStringCollection);
        }
        return this._emails;
    }
    addressInfo() {
        if (!this._addressInfo) {
            const { client, path } = this.__base;
            this._addressInfo = new CollectionServiceV4(client, path, "AddressInfo", qLocation);
        }
        return this._addressInfo;
    }
    homeAddress() {
        if (!this._homeAddress) {
            const { client, path } = this.__base;
            this._homeAddress = new LocationService(client, path, "HomeAddress");
        }
        return this._homeAddress;
    }
    features() {
        if (!this._features) {
            const { client, path } = this.__base;
            this._features = new CollectionServiceV4(client, path, "Features", qEnumCollection);
        }
        return this._features;
    }
    friends(id) {
        const fieldName = "Friends";
        const { client, path } = this.__base;
        return typeof id === "undefined" || id === null
            ? new PersonCollectionService(client, path, fieldName)
            : new PersonService(client, path, new QPersonId(fieldName).buildUrl(id));
    }
    bestFriend() {
        if (!this._bestFriend) {
            const { client, path } = this.__base;
            this._bestFriend = new PersonService(client, path, "BestFriend");
        }
        return this._bestFriend;
    }
    trips(id) {
        const fieldName = "Trips";
        const { client, path } = this.__base;
        return typeof id === "undefined" || id === null
            ? new TripCollectionService(client, path, fieldName)
            : new TripService(client, path, new QTripId(fieldName).buildUrl(id));
    }
    async getFavoriteAirline(requestConfig) {
        if (!this._personQGetFavoriteAirline) {
            this._personQGetFavoriteAirline = new Person_QGetFavoriteAirline();
        }
        const { addFullPath, client, getDefaultHeaders } = this.__base;
        const url = addFullPath(this._personQGetFavoriteAirline.buildUrl());
        const response = await client.get(url, requestConfig, getDefaultHeaders());
        return this._personQGetFavoriteAirline.convertResponse(response);
    }
    async getFriendsTrips(params, requestConfig) {
        if (!this._personQGetFriendsTrips) {
            this._personQGetFriendsTrips = new Person_QGetFriendsTrips();
        }
        const { addFullPath, client, getDefaultHeaders } = this.__base;
        const url = addFullPath(this._personQGetFriendsTrips.buildUrl(params));
        const response = await client.get(url, requestConfig, getDefaultHeaders());
        return this._personQGetFriendsTrips.convertResponse(response);
    }
    async updateLastName(params, requestConfig) {
        if (!this._personQUpdateLastName) {
            this._personQUpdateLastName = new Person_QUpdateLastName();
        }
        const { addFullPath, client, getDefaultHeaders } = this.__base;
        const url = addFullPath(this._personQUpdateLastName.buildUrl());
        const response = await client.post(url, this._personQUpdateLastName.convertUserParams(params), requestConfig, getDefaultHeaders());
        return this._personQUpdateLastName.convertResponse(response);
    }
    async shareTrip(params, requestConfig) {
        if (!this._personQShareTrip) {
            this._personQShareTrip = new Person_QShareTrip();
        }
        const { addFullPath, client, getDefaultHeaders } = this.__base;
        const url = addFullPath(this._personQShareTrip.buildUrl());
        return client.post(url, this._personQShareTrip.convertUserParams(params), requestConfig, getDefaultHeaders());
    }
}
export class PersonCollectionService extends EntitySetServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qPerson, new QPersonId(name));
    }
}
export class AirlineService extends EntityTypeServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qAirline);
    }
}
export class AirlineCollectionService extends EntitySetServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qAirline, new QAirlineId(name));
    }
}
export class AirportService extends EntityTypeServiceV4 {
    _location;
    constructor(client, basePath, name) {
        super(client, basePath, name, qAirport);
    }
    location() {
        if (!this._location) {
            const { client, path } = this.__base;
            this._location = new AirportLocationService(client, path, "Location");
        }
        return this._location;
    }
}
export class AirportCollectionService extends EntitySetServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qAirport, new QAirportId(name));
    }
}
export class TripService extends EntityTypeServiceV4 {
    _tags;
    _tripQGetInvolvedPeople;
    constructor(client, basePath, name) {
        super(client, basePath, name, qTrip);
    }
    tags() {
        if (!this._tags) {
            const { client, path } = this.__base;
            this._tags = new CollectionServiceV4(client, path, "Tags", qStringCollection);
        }
        return this._tags;
    }
    planItems(id) {
        const fieldName = "PlanItems";
        const { client, path } = this.__base;
        return typeof id === "undefined" || id === null
            ? new PlanItemCollectionService(client, path, fieldName)
            : new PlanItemService(client, path, new QPlanItemId(fieldName).buildUrl(id));
    }
    async getInvolvedPeople(requestConfig) {
        if (!this._tripQGetInvolvedPeople) {
            this._tripQGetInvolvedPeople = new Trip_QGetInvolvedPeople();
        }
        const { addFullPath, client, getDefaultHeaders } = this.__base;
        const url = addFullPath(this._tripQGetInvolvedPeople.buildUrl());
        const response = await client.get(url, requestConfig, getDefaultHeaders());
        return this._tripQGetInvolvedPeople.convertResponse(response);
    }
}
export class TripCollectionService extends EntitySetServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qTrip, new QTripId(name));
    }
}
export class PlanItemService extends EntityTypeServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qPlanItem);
    }
}
export class PlanItemCollectionService extends EntitySetServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qPlanItem, new QPlanItemId(name));
    }
}
export class EventService extends EntityTypeServiceV4 {
    _occursAt;
    constructor(client, basePath, name) {
        super(client, basePath, name, qEvent);
    }
    occursAt() {
        if (!this._occursAt) {
            const { client, path } = this.__base;
            this._occursAt = new EventLocationService(client, path, "OccursAt");
        }
        return this._occursAt;
    }
}
export class EventCollectionService extends EntitySetServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qEvent, new QPlanItemId(name));
    }
}
export class PublicTransportationService extends EntityTypeServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qPublicTransportation);
    }
}
export class PublicTransportationCollectionService extends EntitySetServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qPublicTransportation, new QPlanItemId(name));
    }
}
export class FlightService extends EntityTypeServiceV4 {
    _airline;
    _from;
    _to;
    constructor(client, basePath, name) {
        super(client, basePath, name, qFlight);
    }
    airline() {
        if (!this._airline) {
            const { client, path } = this.__base;
            this._airline = new AirlineService(client, path, "Airline");
        }
        return this._airline;
    }
    from() {
        if (!this._from) {
            const { client, path } = this.__base;
            this._from = new AirportService(client, path, "From");
        }
        return this._from;
    }
    to() {
        if (!this._to) {
            const { client, path } = this.__base;
            this._to = new AirportService(client, path, "To");
        }
        return this._to;
    }
}
export class FlightCollectionService extends EntitySetServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qFlight, new QPlanItemId(name));
    }
}
export class EmployeeService extends EntityTypeServiceV4 {
    _emails;
    _addressInfo;
    _homeAddress;
    _features;
    _bestFriend;
    constructor(client, basePath, name) {
        super(client, basePath, name, qEmployee);
    }
    emails() {
        if (!this._emails) {
            const { client, path } = this.__base;
            this._emails = new CollectionServiceV4(client, path, "Emails", qStringCollection);
        }
        return this._emails;
    }
    addressInfo() {
        if (!this._addressInfo) {
            const { client, path } = this.__base;
            this._addressInfo = new CollectionServiceV4(client, path, "AddressInfo", qLocation);
        }
        return this._addressInfo;
    }
    homeAddress() {
        if (!this._homeAddress) {
            const { client, path } = this.__base;
            this._homeAddress = new LocationService(client, path, "HomeAddress");
        }
        return this._homeAddress;
    }
    features() {
        if (!this._features) {
            const { client, path } = this.__base;
            this._features = new CollectionServiceV4(client, path, "Features", qEnumCollection);
        }
        return this._features;
    }
    friends(id) {
        const fieldName = "Friends";
        const { client, path } = this.__base;
        return typeof id === "undefined" || id === null
            ? new PersonCollectionService(client, path, fieldName)
            : new PersonService(client, path, new QPersonId(fieldName).buildUrl(id));
    }
    bestFriend() {
        if (!this._bestFriend) {
            const { client, path } = this.__base;
            this._bestFriend = new PersonService(client, path, "BestFriend");
        }
        return this._bestFriend;
    }
    trips(id) {
        const fieldName = "Trips";
        const { client, path } = this.__base;
        return typeof id === "undefined" || id === null
            ? new TripCollectionService(client, path, fieldName)
            : new TripService(client, path, new QTripId(fieldName).buildUrl(id));
    }
    peers(id) {
        const fieldName = "Peers";
        const { client, path } = this.__base;
        return typeof id === "undefined" || id === null
            ? new PersonCollectionService(client, path, fieldName)
            : new PersonService(client, path, new QPersonId(fieldName).buildUrl(id));
    }
}
export class EmployeeCollectionService extends EntitySetServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qEmployee, new QPersonId(name));
    }
}
export class ManagerService extends EntityTypeServiceV4 {
    _emails;
    _addressInfo;
    _homeAddress;
    _features;
    _bestFriend;
    _bossOffice;
    constructor(client, basePath, name) {
        super(client, basePath, name, qManager);
    }
    emails() {
        if (!this._emails) {
            const { client, path } = this.__base;
            this._emails = new CollectionServiceV4(client, path, "Emails", qStringCollection);
        }
        return this._emails;
    }
    addressInfo() {
        if (!this._addressInfo) {
            const { client, path } = this.__base;
            this._addressInfo = new CollectionServiceV4(client, path, "AddressInfo", qLocation);
        }
        return this._addressInfo;
    }
    homeAddress() {
        if (!this._homeAddress) {
            const { client, path } = this.__base;
            this._homeAddress = new LocationService(client, path, "HomeAddress");
        }
        return this._homeAddress;
    }
    features() {
        if (!this._features) {
            const { client, path } = this.__base;
            this._features = new CollectionServiceV4(client, path, "Features", qEnumCollection);
        }
        return this._features;
    }
    friends(id) {
        const fieldName = "Friends";
        const { client, path } = this.__base;
        return typeof id === "undefined" || id === null
            ? new PersonCollectionService(client, path, fieldName)
            : new PersonService(client, path, new QPersonId(fieldName).buildUrl(id));
    }
    bestFriend() {
        if (!this._bestFriend) {
            const { client, path } = this.__base;
            this._bestFriend = new PersonService(client, path, "BestFriend");
        }
        return this._bestFriend;
    }
    trips(id) {
        const fieldName = "Trips";
        const { client, path } = this.__base;
        return typeof id === "undefined" || id === null
            ? new TripCollectionService(client, path, fieldName)
            : new TripService(client, path, new QTripId(fieldName).buildUrl(id));
    }
    bossOffice() {
        if (!this._bossOffice) {
            const { client, path } = this.__base;
            this._bossOffice = new LocationService(client, path, "BossOffice");
        }
        return this._bossOffice;
    }
    directReports(id) {
        const fieldName = "DirectReports";
        const { client, path } = this.__base;
        return typeof id === "undefined" || id === null
            ? new PersonCollectionService(client, path, fieldName)
            : new PersonService(client, path, new QPersonId(fieldName).buildUrl(id));
    }
}
export class ManagerCollectionService extends EntitySetServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qManager, new QPersonId(name));
    }
}
export class LocationService extends EntityTypeServiceV4 {
    _city;
    constructor(client, basePath, name) {
        super(client, basePath, name, qLocation);
    }
    city() {
        if (!this._city) {
            const { client, path } = this.__base;
            this._city = new CityService(client, path, "City");
        }
        return this._city;
    }
}
export class CityService extends EntityTypeServiceV4 {
    constructor(client, basePath, name) {
        super(client, basePath, name, qCity);
    }
}
export class AirportLocationService extends EntityTypeServiceV4 {
    _city;
    constructor(client, basePath, name) {
        super(client, basePath, name, qAirportLocation);
    }
    city() {
        if (!this._city) {
            const { client, path } = this.__base;
            this._city = new CityService(client, path, "City");
        }
        return this._city;
    }
}
export class EventLocationService extends EntityTypeServiceV4 {
    _city;
    constructor(client, basePath, name) {
        super(client, basePath, name, qEventLocation);
    }
    city() {
        if (!this._city) {
            const { client, path } = this.__base;
            this._city = new CityService(client, path, "City");
        }
        return this._city;
    }
}
