export declare enum PersonGender {
    Male = "Male",
    Female = "Female",
    Unknown = "Unknown"
}
export declare enum Feature {
    Feature1 = "Feature1",
    Feature2 = "Feature2",
    Feature3 = "Feature3",
    Feature4 = "Feature4"
}
export interface Person {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `UserName` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    userName: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `FirstName` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    firstName: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `LastName` |
     * | Type | `Edm.String` |
     */
    lastName: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `MiddleName` |
     * | Type | `Edm.String` |
     */
    middleName: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Gender` |
     * | Type | `Trippin.PersonGender` |
     * | Nullable | `false` |
     */
    gender: PersonGender;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Age` |
     * | Type | `Edm.Int64` |
     */
    age: number | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Emails` |
     * | Type | `Collection(Edm.String)` |
     */
    emails: Array<string>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `AddressInfo` |
     * | Type | `Collection(Trippin.Location)` |
     */
    addressInfo: Array<Location>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `HomeAddress` |
     * | Type | `Trippin.Location` |
     */
    homeAddress: Location | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `FavoriteFeature` |
     * | Type | `Trippin.Feature` |
     * | Nullable | `false` |
     */
    favoriteFeature: Feature;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Features` |
     * | Type | `Collection(Trippin.Feature)` |
     * | Nullable | `false` |
     */
    features: Array<Feature>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Friends` |
     * | Type | `Collection(Trippin.Person)` |
     */
    friends?: Array<Person>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `BestFriend` |
     * | Type | `Trippin.Person` |
     */
    bestFriend?: Person | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Trips` |
     * | Type | `Collection(Trippin.Trip)` |
     */
    trips?: Array<Trip>;
}
export type PersonId = string | {
    userName: string;
};
export interface EditablePerson extends Pick<Person, "firstName" | "gender" | "favoriteFeature" | "features">, Partial<Pick<Person, "lastName" | "middleName" | "age" | "emails">> {
    addressInfo?: Array<EditableLocation>;
    homeAddress?: EditableLocation | null;
}
export interface Person_GetFriendsTripsParams {
    userName: string;
}
export interface Person_UpdateLastNameParams {
    lastName: string;
}
export interface Person_ShareTripParams {
    userName: string;
    tripId: number;
}
export interface Airline {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `AirlineCode` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    airlineCode: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Name` |
     * | Type | `Edm.String` |
     */
    name: string | null;
}
export type AirlineId = string | {
    airlineCode: string;
};
export interface EditableAirline extends Partial<Pick<Airline, "name">> {
}
export interface Airport {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Name` |
     * | Type | `Edm.String` |
     */
    name: string | null;
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `IcaoCode` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    icaoCode: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `IataCode` |
     * | Type | `Edm.String` |
     */
    iataCode: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Location` |
     * | Type | `Trippin.AirportLocation` |
     */
    location: AirportLocation | null;
}
export type AirportId = string | {
    icaoCode: string;
};
export interface EditableAirport extends Partial<Pick<Airport, "name" | "iataCode">> {
    location?: EditableAirportLocation | null;
}
export interface Trip {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `TripId` |
     * | Type | `Edm.Int32` |
     * | Nullable | `false` |
     */
    tripId: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ShareId` |
     * | Type | `Edm.Guid` |
     * | Nullable | `false` |
     */
    shareId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Name` |
     * | Type | `Edm.String` |
     */
    name: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Budget` |
     * | Type | `Edm.Single` |
     * | Nullable | `false` |
     */
    budget: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Description` |
     * | Type | `Edm.String` |
     */
    description: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Tags` |
     * | Type | `Collection(Edm.String)` |
     */
    tags: Array<string>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `StartsAt` |
     * | Type | `Edm.DateTimeOffset` |
     * | Nullable | `false` |
     */
    startsAt: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `EndsAt` |
     * | Type | `Edm.DateTimeOffset` |
     * | Nullable | `false` |
     */
    endsAt: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `PlanItems` |
     * | Type | `Collection(Trippin.PlanItem)` |
     */
    planItems?: Array<PlanItem>;
}
export type TripId = number | {
    tripId: number;
};
export interface EditableTrip extends Pick<Trip, "shareId" | "budget" | "startsAt" | "endsAt">, Partial<Pick<Trip, "name" | "description" | "tags">> {
}
export interface PlanItem {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `PlanItemId` |
     * | Type | `Edm.Int32` |
     * | Nullable | `false` |
     */
    planItemId: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ConfirmationCode` |
     * | Type | `Edm.String` |
     */
    confirmationCode: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `StartsAt` |
     * | Type | `Edm.DateTimeOffset` |
     * | Nullable | `false` |
     */
    startsAt: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `EndsAt` |
     * | Type | `Edm.DateTimeOffset` |
     * | Nullable | `false` |
     */
    endsAt: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Duration` |
     * | Type | `Edm.Duration` |
     * | Nullable | `false` |
     */
    duration: string;
}
export type PlanItemId = number | {
    planItemId: number;
};
export interface EditablePlanItem extends Pick<PlanItem, "startsAt" | "endsAt" | "duration">, Partial<Pick<PlanItem, "confirmationCode">> {
}
export interface Event extends PlanItem {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `OccursAt` |
     * | Type | `Trippin.EventLocation` |
     */
    occursAt: EventLocation | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Description` |
     * | Type | `Edm.String` |
     */
    description: string | null;
}
export interface EditableEvent extends Pick<Event, "startsAt" | "endsAt" | "duration">, Partial<Pick<Event, "confirmationCode" | "description">> {
    occursAt?: EditableEventLocation | null;
}
export interface PublicTransportation extends PlanItem {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `SeatNumber` |
     * | Type | `Edm.String` |
     */
    seatNumber: string | null;
}
export interface EditablePublicTransportation extends Pick<PublicTransportation, "startsAt" | "endsAt" | "duration">, Partial<Pick<PublicTransportation, "confirmationCode" | "seatNumber">> {
}
export interface Flight extends PublicTransportation {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `FlightNumber` |
     * | Type | `Edm.String` |
     */
    flightNumber: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Airline` |
     * | Type | `Trippin.Airline` |
     */
    airline?: Airline | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `From` |
     * | Type | `Trippin.Airport` |
     */
    from?: Airport | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `To` |
     * | Type | `Trippin.Airport` |
     */
    to?: Airport | null;
}
export interface EditableFlight extends Pick<Flight, "startsAt" | "endsAt" | "duration">, Partial<Pick<Flight, "confirmationCode" | "seatNumber" | "flightNumber">> {
}
export interface Employee extends Person {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Cost` |
     * | Type | `Edm.Int64` |
     * | Nullable | `false` |
     */
    cost: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Peers` |
     * | Type | `Collection(Trippin.Person)` |
     */
    peers?: Array<Person>;
}
export interface EditableEmployee extends Pick<Employee, "firstName" | "gender" | "favoriteFeature" | "features" | "cost">, Partial<Pick<Employee, "lastName" | "middleName" | "age" | "emails">> {
    addressInfo?: Array<EditableLocation>;
    homeAddress?: EditableLocation | null;
}
export interface Manager extends Person {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Budget` |
     * | Type | `Edm.Int64` |
     * | Nullable | `false` |
     */
    budget: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `BossOffice` |
     * | Type | `Trippin.Location` |
     */
    bossOffice: Location | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `DirectReports` |
     * | Type | `Collection(Trippin.Person)` |
     */
    directReports?: Array<Person>;
}
export interface EditableManager extends Pick<Manager, "firstName" | "gender" | "favoriteFeature" | "features" | "budget">, Partial<Pick<Manager, "lastName" | "middleName" | "age" | "emails">> {
    addressInfo?: Array<EditableLocation>;
    homeAddress?: EditableLocation | null;
    bossOffice?: EditableLocation | null;
}
export interface Location {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Address` |
     * | Type | `Edm.String` |
     */
    address: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `City` |
     * | Type | `Trippin.City` |
     */
    city: City | null;
}
export interface EditableLocation extends Partial<Pick<Location, "address">> {
    city?: EditableCity | null;
}
export interface City {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Name` |
     * | Type | `Edm.String` |
     */
    name: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `CountryRegion` |
     * | Type | `Edm.String` |
     */
    countryRegion: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Region` |
     * | Type | `Edm.String` |
     */
    region: string | null;
}
export interface EditableCity extends Partial<Pick<City, "name" | "countryRegion" | "region">> {
}
export interface AirportLocation extends Location {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Loc` |
     * | Type | `Edm.GeographyPoint` |
     */
    loc: string | null;
}
export interface EditableAirportLocation extends Partial<Pick<AirportLocation, "address" | "loc">> {
    city?: EditableCity | null;
}
export interface EventLocation extends Location {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `BuildingInfo` |
     * | Type | `Edm.String` |
     */
    buildingInfo: string | null;
}
export interface EditableEventLocation extends Partial<Pick<EventLocation, "address" | "buildingInfo">> {
    city?: EditableCity | null;
}
export interface GetNearestAirportParams {
    lat: number;
    lon: number;
}
