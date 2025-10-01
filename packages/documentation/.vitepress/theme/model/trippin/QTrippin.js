import { QStringPath, QEnumPath, QNumberPath, QCollectionPath, QStringCollection, QEntityCollectionPath, QEntityPath, QEnumCollection, QId, QStringParam, QFunction, OperationReturnType, ReturnTypes, QComplexParam, QAction, QNumberParam, QGuidPath, QDateTimeOffsetPath, QueryObject } from "@odata2ts/odata-query-objects";
export class QPerson extends QueryObject {
    userName = new QStringPath(this.withPrefix("UserName"));
    firstName = new QStringPath(this.withPrefix("FirstName"));
    lastName = new QStringPath(this.withPrefix("LastName"));
    middleName = new QStringPath(this.withPrefix("MiddleName"));
    gender = new QEnumPath(this.withPrefix("Gender"));
    age = new QNumberPath(this.withPrefix("Age"));
    emails = new QCollectionPath(this.withPrefix("Emails"), () => QStringCollection);
    addressInfo = new QEntityCollectionPath(this.withPrefix("AddressInfo"), () => QLocation);
    homeAddress = new QEntityPath(this.withPrefix("HomeAddress"), () => QLocation);
    favoriteFeature = new QEnumPath(this.withPrefix("FavoriteFeature"));
    features = new QCollectionPath(this.withPrefix("Features"), () => QEnumCollection);
    friends = new QEntityCollectionPath(this.withPrefix("Friends"), () => QPerson);
    bestFriend = new QEntityPath(this.withPrefix("BestFriend"), () => QPerson);
    trips = new QEntityCollectionPath(this.withPrefix("Trips"), () => QTrip);
}
export const qPerson = new QPerson();
export class QPersonId extends QId {
    params = [new QStringParam("UserName", "userName")];
    getParams() {
        return this.params;
    }
}
export class Person_QGetFavoriteAirline extends QFunction {
    params = [];
    constructor() {
        super("Trippin.GetFavoriteAirline", new OperationReturnType(ReturnTypes.COMPLEX, new QComplexParam("NONE", new QAirline)));
    }
    getParams() {
        return this.params;
    }
    buildUrl() {
        return super.buildUrl(undefined);
    }
}
export class Person_QGetFriendsTrips extends QFunction {
    params = [new QStringParam("userName")];
    constructor() {
        super("Trippin.GetFriendsTrips", new OperationReturnType(ReturnTypes.COMPLEX_COLLECTION, new QComplexParam("NONE", new QTrip)));
    }
    getParams() {
        return this.params;
    }
}
export class Person_QUpdateLastName extends QAction {
    params = [new QStringParam("lastName")];
    constructor() {
        super("Trippin.UpdateLastName");
    }
    getParams() {
        return this.params;
    }
}
export class Person_QShareTrip extends QAction {
    params = [new QStringParam("userName"), new QNumberParam("tripId")];
    constructor() {
        super("Trippin.ShareTrip");
    }
    getParams() {
        return this.params;
    }
}
export class QAirline extends QueryObject {
    airlineCode = new QStringPath(this.withPrefix("AirlineCode"));
    name = new QStringPath(this.withPrefix("Name"));
}
export const qAirline = new QAirline();
export class QAirlineId extends QId {
    params = [new QStringParam("AirlineCode", "airlineCode")];
    getParams() {
        return this.params;
    }
}
export class QAirport extends QueryObject {
    name = new QStringPath(this.withPrefix("Name"));
    icaoCode = new QStringPath(this.withPrefix("IcaoCode"));
    iataCode = new QStringPath(this.withPrefix("IataCode"));
    location = new QEntityPath(this.withPrefix("Location"), () => QAirportLocation);
}
export const qAirport = new QAirport();
export class QAirportId extends QId {
    params = [new QStringParam("IcaoCode", "icaoCode")];
    getParams() {
        return this.params;
    }
}
export class QTrip extends QueryObject {
    tripId = new QNumberPath(this.withPrefix("TripId"));
    shareId = new QGuidPath(this.withPrefix("ShareId"));
    name = new QStringPath(this.withPrefix("Name"));
    budget = new QNumberPath(this.withPrefix("Budget"));
    description = new QStringPath(this.withPrefix("Description"));
    tags = new QCollectionPath(this.withPrefix("Tags"), () => QStringCollection);
    startsAt = new QDateTimeOffsetPath(this.withPrefix("StartsAt"));
    endsAt = new QDateTimeOffsetPath(this.withPrefix("EndsAt"));
    planItems = new QEntityCollectionPath(this.withPrefix("PlanItems"), () => QPlanItem);
}
export const qTrip = new QTrip();
export class QTripId extends QId {
    params = [new QNumberParam("TripId", "tripId")];
    getParams() {
        return this.params;
    }
}
export class Trip_QGetInvolvedPeople extends QFunction {
    params = [];
    constructor() {
        super("Trippin.GetInvolvedPeople", new OperationReturnType(ReturnTypes.COMPLEX_COLLECTION, new QComplexParam("NONE", new QPerson)));
    }
    getParams() {
        return this.params;
    }
    buildUrl() {
        return super.buildUrl(undefined);
    }
}
export class QPlanItem extends QueryObject {
    planItemId = new QNumberPath(this.withPrefix("PlanItemId"));
    confirmationCode = new QStringPath(this.withPrefix("ConfirmationCode"));
    startsAt = new QDateTimeOffsetPath(this.withPrefix("StartsAt"));
    endsAt = new QDateTimeOffsetPath(this.withPrefix("EndsAt"));
    duration = new QStringPath(this.withPrefix("Duration"));
}
export const qPlanItem = new QPlanItem();
export class QPlanItemId extends QId {
    params = [new QNumberParam("PlanItemId", "planItemId")];
    getParams() {
        return this.params;
    }
}
export class QEvent extends QPlanItem {
    occursAt = new QEntityPath(this.withPrefix("OccursAt"), () => QEventLocation);
    description = new QStringPath(this.withPrefix("Description"));
}
export const qEvent = new QEvent();
export class QPublicTransportation extends QPlanItem {
    seatNumber = new QStringPath(this.withPrefix("SeatNumber"));
}
export const qPublicTransportation = new QPublicTransportation();
export class QFlight extends QPublicTransportation {
    flightNumber = new QStringPath(this.withPrefix("FlightNumber"));
    airline = new QEntityPath(this.withPrefix("Airline"), () => QAirline);
    from = new QEntityPath(this.withPrefix("From"), () => QAirport);
    to = new QEntityPath(this.withPrefix("To"), () => QAirport);
}
export const qFlight = new QFlight();
export class QEmployee extends QPerson {
    cost = new QNumberPath(this.withPrefix("Cost"));
    peers = new QEntityCollectionPath(this.withPrefix("Peers"), () => QPerson);
}
export const qEmployee = new QEmployee();
export class QManager extends QPerson {
    budget = new QNumberPath(this.withPrefix("Budget"));
    bossOffice = new QEntityPath(this.withPrefix("BossOffice"), () => QLocation);
    directReports = new QEntityCollectionPath(this.withPrefix("DirectReports"), () => QPerson);
}
export const qManager = new QManager();
export class QLocation extends QueryObject {
    address = new QStringPath(this.withPrefix("Address"));
    city = new QEntityPath(this.withPrefix("City"), () => QCity);
}
export const qLocation = new QLocation();
export class QCity extends QueryObject {
    name = new QStringPath(this.withPrefix("Name"));
    countryRegion = new QStringPath(this.withPrefix("CountryRegion"));
    region = new QStringPath(this.withPrefix("Region"));
}
export const qCity = new QCity();
export class QAirportLocation extends QLocation {
    loc = new QStringPath(this.withPrefix("Loc"));
}
export const qAirportLocation = new QAirportLocation();
export class QEventLocation extends QLocation {
    buildingInfo = new QStringPath(this.withPrefix("BuildingInfo"));
}
export const qEventLocation = new QEventLocation();
export class QGetPersonWithMostFriends extends QFunction {
    params = [];
    constructor() {
        super("GetPersonWithMostFriends", new OperationReturnType(ReturnTypes.COMPLEX, new QComplexParam("NONE", new QPerson)));
    }
    getParams() {
        return this.params;
    }
    buildUrl() {
        return super.buildUrl(undefined);
    }
}
export class QGetNearestAirport extends QFunction {
    params = [new QNumberParam("lat"), new QNumberParam("lon")];
    constructor() {
        super("GetNearestAirport", new OperationReturnType(ReturnTypes.COMPLEX, new QComplexParam("NONE", new QAirport)));
    }
    getParams() {
        return this.params;
    }
}
export class QResetDataSource extends QAction {
    params = [];
    constructor() {
        super("ResetDataSource");
    }
    getParams() {
        return this.params;
    }
}
