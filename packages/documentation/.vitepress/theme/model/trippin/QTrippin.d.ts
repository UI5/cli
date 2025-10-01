import { QStringPath, QEnumPath, QNumberPath, QCollectionPath, QStringCollection, QEntityCollectionPath, QEntityPath, QEnumCollection, QId, QStringParam, QFunction, QAction, QNumberParam, QGuidPath, QDateTimeOffsetPath, QueryObject } from "@odata2ts/odata-query-objects";
import { PersonId, Person_GetFriendsTripsParams, Person_UpdateLastNameParams, Person_ShareTripParams, AirlineId, AirportId, TripId, PlanItemId, GetNearestAirportParams } from "./TrippinModel";
export declare class QPerson extends QueryObject {
    readonly userName: QStringPath<string>;
    readonly firstName: QStringPath<string>;
    readonly lastName: QStringPath<string>;
    readonly middleName: QStringPath<string>;
    readonly gender: QEnumPath<string>;
    readonly age: QNumberPath<number>;
    readonly emails: QCollectionPath<QStringCollection>;
    readonly addressInfo: QEntityCollectionPath<QLocation>;
    readonly homeAddress: QEntityPath<QLocation>;
    readonly favoriteFeature: QEnumPath<string>;
    readonly features: QCollectionPath<QEnumCollection>;
    readonly friends: QEntityCollectionPath<QPerson>;
    readonly bestFriend: QEntityPath<QPerson>;
    readonly trips: QEntityCollectionPath<QTrip>;
}
export declare const qPerson: QPerson;
export declare class QPersonId extends QId<PersonId> {
    private readonly params;
    getParams(): QStringParam<string>[];
}
export declare class Person_QGetFavoriteAirline extends QFunction {
    private readonly params;
    constructor();
    getParams(): [];
    buildUrl(): string;
}
export declare class Person_QGetFriendsTrips extends QFunction<Person_GetFriendsTripsParams> {
    private readonly params;
    constructor();
    getParams(): QStringParam<string>[];
}
export declare class Person_QUpdateLastName extends QAction<Person_UpdateLastNameParams> {
    private readonly params;
    constructor();
    getParams(): QStringParam<string>[];
}
export declare class Person_QShareTrip extends QAction<Person_ShareTripParams> {
    private readonly params;
    constructor();
    getParams(): (QStringParam<string> | QNumberParam<number>)[];
}
export declare class QAirline extends QueryObject {
    readonly airlineCode: QStringPath<string>;
    readonly name: QStringPath<string>;
}
export declare const qAirline: QAirline;
export declare class QAirlineId extends QId<AirlineId> {
    private readonly params;
    getParams(): QStringParam<string>[];
}
export declare class QAirport extends QueryObject {
    readonly name: QStringPath<string>;
    readonly icaoCode: QStringPath<string>;
    readonly iataCode: QStringPath<string>;
    readonly location: QEntityPath<QAirportLocation>;
}
export declare const qAirport: QAirport;
export declare class QAirportId extends QId<AirportId> {
    private readonly params;
    getParams(): QStringParam<string>[];
}
export declare class QTrip extends QueryObject {
    readonly tripId: QNumberPath<number>;
    readonly shareId: QGuidPath<string>;
    readonly name: QStringPath<string>;
    readonly budget: QNumberPath<number>;
    readonly description: QStringPath<string>;
    readonly tags: QCollectionPath<QStringCollection>;
    readonly startsAt: QDateTimeOffsetPath<string>;
    readonly endsAt: QDateTimeOffsetPath<string>;
    readonly planItems: QEntityCollectionPath<QPlanItem>;
}
export declare const qTrip: QTrip;
export declare class QTripId extends QId<TripId> {
    private readonly params;
    getParams(): QNumberParam<number>[];
}
export declare class Trip_QGetInvolvedPeople extends QFunction {
    private readonly params;
    constructor();
    getParams(): [];
    buildUrl(): string;
}
export declare class QPlanItem extends QueryObject {
    readonly planItemId: QNumberPath<number>;
    readonly confirmationCode: QStringPath<string>;
    readonly startsAt: QDateTimeOffsetPath<string>;
    readonly endsAt: QDateTimeOffsetPath<string>;
    readonly duration: QStringPath<string>;
}
export declare const qPlanItem: QPlanItem;
export declare class QPlanItemId extends QId<PlanItemId> {
    private readonly params;
    getParams(): QNumberParam<number>[];
}
export declare class QEvent extends QPlanItem {
    readonly occursAt: QEntityPath<QEventLocation>;
    readonly description: QStringPath<string>;
}
export declare const qEvent: QEvent;
export declare class QPublicTransportation extends QPlanItem {
    readonly seatNumber: QStringPath<string>;
}
export declare const qPublicTransportation: QPublicTransportation;
export declare class QFlight extends QPublicTransportation {
    readonly flightNumber: QStringPath<string>;
    readonly airline: QEntityPath<QAirline>;
    readonly from: QEntityPath<QAirport>;
    readonly to: QEntityPath<QAirport>;
}
export declare const qFlight: QFlight;
export declare class QEmployee extends QPerson {
    readonly cost: QNumberPath<number>;
    readonly peers: QEntityCollectionPath<QPerson>;
}
export declare const qEmployee: QEmployee;
export declare class QManager extends QPerson {
    readonly budget: QNumberPath<number>;
    readonly bossOffice: QEntityPath<QLocation>;
    readonly directReports: QEntityCollectionPath<QPerson>;
}
export declare const qManager: QManager;
export declare class QLocation extends QueryObject {
    readonly address: QStringPath<string>;
    readonly city: QEntityPath<QCity>;
}
export declare const qLocation: QLocation;
export declare class QCity extends QueryObject {
    readonly name: QStringPath<string>;
    readonly countryRegion: QStringPath<string>;
    readonly region: QStringPath<string>;
}
export declare const qCity: QCity;
export declare class QAirportLocation extends QLocation {
    readonly loc: QStringPath<string>;
}
export declare const qAirportLocation: QAirportLocation;
export declare class QEventLocation extends QLocation {
    readonly buildingInfo: QStringPath<string>;
}
export declare const qEventLocation: QEventLocation;
export declare class QGetPersonWithMostFriends extends QFunction {
    private readonly params;
    constructor();
    getParams(): [];
    buildUrl(): string;
}
export declare class QGetNearestAirport extends QFunction<GetNearestAirportParams> {
    private readonly params;
    constructor();
    getParams(): QNumberParam<number>[];
}
export declare class QResetDataSource extends QAction {
    private readonly params;
    constructor();
    getParams(): [];
}
