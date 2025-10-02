import { ODataModelResponseV4, ODataCollectionResponseV4, ODataValueResponseV4 } from "@odata2ts/odata-core";
import { QStringCollection, StringCollection, QEnumCollection, EnumCollection } from "@odata2ts/odata-query-objects";
import { ODataHttpClient, ODataHttpClientConfig, ODataResponse } from "@odata2ts/http-client-api";
import { ODataService, EntityTypeServiceV4, CollectionServiceV4, EntitySetServiceV4 } from "@odata2ts/odata-service";
import { PersonId, AirlineId, AirportId, Person, Airport, GetNearestAirportParams, EditablePerson, Location, EditableLocation, Feature, TripId, Airline, Trip, Person_GetFriendsTripsParams, Person_UpdateLastNameParams, Person_ShareTripParams, EditableAirline, EditableAirport, EditableTrip, PlanItemId, PlanItem, EditablePlanItem, Event, EditableEvent, PublicTransportation, EditablePublicTransportation, Flight, EditableFlight, Employee, EditableEmployee, Manager, EditableManager, City, EditableCity, AirportLocation, EditableAirportLocation, EventLocation, EditableEventLocation } from "./TrippinModel";
import { QPerson, QLocation, QAirline, QAirport, QTrip, QPlanItem, QEvent, QPublicTransportation, QFlight, QEmployee, QManager, QCity, QAirportLocation, QEventLocation } from "./QTrippin";
export declare class TrippinService<ClientType extends ODataHttpClient> extends ODataService<ClientType> {
    private _me?;
    private _qGetPersonWithMostFriends?;
    private _qGetNearestAirport?;
    private _qResetDataSource?;
    people(): PersonCollectionService<ClientType>;
    people(id: PersonId): PersonService<ClientType>;
    airlines(): AirlineCollectionService<ClientType>;
    airlines(id: AirlineId): AirlineService<ClientType>;
    airports(): AirportCollectionService<ClientType>;
    airports(id: AirportId): AirportService<ClientType>;
    me(): PersonService<ClientType>;
    getPersonWithMostFriends(requestConfig?: ODataHttpClientConfig<ClientType>): ODataResponse<ODataModelResponseV4<Person>>;
    getNearestAirport(params: GetNearestAirportParams, requestConfig?: ODataHttpClientConfig<ClientType>): ODataResponse<ODataModelResponseV4<Airport>>;
    resetDataSource(requestConfig?: ODataHttpClientConfig<ClientType>): ODataResponse<ODataModelResponseV4<void>>;
}
export declare class PersonService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, Person, EditablePerson, QPerson> {
    private _emails?;
    private _addressInfo?;
    private _homeAddress?;
    private _features?;
    private _bestFriend?;
    private _personQGetFavoriteAirline?;
    private _personQGetFriendsTrips?;
    private _personQUpdateLastName?;
    private _personQShareTrip?;
    constructor(client: ClientType, basePath: string, name: string);
    emails(): CollectionServiceV4<ClientType, StringCollection, QStringCollection, string>;
    addressInfo(): CollectionServiceV4<ClientType, Location, QLocation, EditableLocation>;
    homeAddress(): LocationService<ClientType>;
    features(): CollectionServiceV4<ClientType, EnumCollection<Feature>, QEnumCollection, Feature>;
    friends(): PersonCollectionService<ClientType>;
    friends(id: PersonId): PersonService<ClientType>;
    bestFriend(): PersonService<ClientType>;
    trips(): TripCollectionService<ClientType>;
    trips(id: TripId): TripService<ClientType>;
    getFavoriteAirline(requestConfig?: ODataHttpClientConfig<ClientType>): ODataResponse<ODataModelResponseV4<Airline>>;
    getFriendsTrips(params: Person_GetFriendsTripsParams, requestConfig?: ODataHttpClientConfig<ClientType>): ODataResponse<ODataCollectionResponseV4<Trip>>;
    updateLastName(params: Person_UpdateLastNameParams, requestConfig?: ODataHttpClientConfig<ClientType>): ODataResponse<ODataValueResponseV4<boolean>>;
    shareTrip(params: Person_ShareTripParams, requestConfig?: ODataHttpClientConfig<ClientType>): ODataResponse<ODataModelResponseV4<void>>;
}
export declare class PersonCollectionService<ClientType extends ODataHttpClient> extends EntitySetServiceV4<ClientType, Person, EditablePerson, QPerson, PersonId> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class AirlineService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, Airline, EditableAirline, QAirline> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class AirlineCollectionService<ClientType extends ODataHttpClient> extends EntitySetServiceV4<ClientType, Airline, EditableAirline, QAirline, AirlineId> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class AirportService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, Airport, EditableAirport, QAirport> {
    private _location?;
    constructor(client: ClientType, basePath: string, name: string);
    location(): AirportLocationService<ClientType>;
}
export declare class AirportCollectionService<ClientType extends ODataHttpClient> extends EntitySetServiceV4<ClientType, Airport, EditableAirport, QAirport, AirportId> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class TripService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, Trip, EditableTrip, QTrip> {
    private _tags?;
    private _tripQGetInvolvedPeople?;
    constructor(client: ClientType, basePath: string, name: string);
    tags(): CollectionServiceV4<ClientType, StringCollection, QStringCollection, string>;
    planItems(): PlanItemCollectionService<ClientType>;
    planItems(id: PlanItemId): PlanItemService<ClientType>;
    getInvolvedPeople(requestConfig?: ODataHttpClientConfig<ClientType>): ODataResponse<ODataCollectionResponseV4<Person>>;
}
export declare class TripCollectionService<ClientType extends ODataHttpClient> extends EntitySetServiceV4<ClientType, Trip, EditableTrip, QTrip, TripId> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class PlanItemService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, PlanItem, EditablePlanItem, QPlanItem> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class PlanItemCollectionService<ClientType extends ODataHttpClient> extends EntitySetServiceV4<ClientType, PlanItem, EditablePlanItem, QPlanItem, PlanItemId> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class EventService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, Event, EditableEvent, QEvent> {
    private _occursAt?;
    constructor(client: ClientType, basePath: string, name: string);
    occursAt(): EventLocationService<ClientType>;
}
export declare class EventCollectionService<ClientType extends ODataHttpClient> extends EntitySetServiceV4<ClientType, Event, EditableEvent, QEvent, PlanItemId> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class PublicTransportationService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, PublicTransportation, EditablePublicTransportation, QPublicTransportation> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class PublicTransportationCollectionService<ClientType extends ODataHttpClient> extends EntitySetServiceV4<ClientType, PublicTransportation, EditablePublicTransportation, QPublicTransportation, PlanItemId> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class FlightService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, Flight, EditableFlight, QFlight> {
    private _airline?;
    private _from?;
    private _to?;
    constructor(client: ClientType, basePath: string, name: string);
    airline(): AirlineService<ClientType>;
    from(): AirportService<ClientType>;
    to(): AirportService<ClientType>;
}
export declare class FlightCollectionService<ClientType extends ODataHttpClient> extends EntitySetServiceV4<ClientType, Flight, EditableFlight, QFlight, PlanItemId> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class EmployeeService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, Employee, EditableEmployee, QEmployee> {
    private _emails?;
    private _addressInfo?;
    private _homeAddress?;
    private _features?;
    private _bestFriend?;
    constructor(client: ClientType, basePath: string, name: string);
    emails(): CollectionServiceV4<ClientType, StringCollection, QStringCollection, string>;
    addressInfo(): CollectionServiceV4<ClientType, Location, QLocation, EditableLocation>;
    homeAddress(): LocationService<ClientType>;
    features(): CollectionServiceV4<ClientType, EnumCollection<Feature>, QEnumCollection, Feature>;
    friends(): PersonCollectionService<ClientType>;
    friends(id: PersonId): PersonService<ClientType>;
    bestFriend(): PersonService<ClientType>;
    trips(): TripCollectionService<ClientType>;
    trips(id: TripId): TripService<ClientType>;
    peers(): PersonCollectionService<ClientType>;
    peers(id: PersonId): PersonService<ClientType>;
}
export declare class EmployeeCollectionService<ClientType extends ODataHttpClient> extends EntitySetServiceV4<ClientType, Employee, EditableEmployee, QEmployee, PersonId> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class ManagerService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, Manager, EditableManager, QManager> {
    private _emails?;
    private _addressInfo?;
    private _homeAddress?;
    private _features?;
    private _bestFriend?;
    private _bossOffice?;
    constructor(client: ClientType, basePath: string, name: string);
    emails(): CollectionServiceV4<ClientType, StringCollection, QStringCollection, string>;
    addressInfo(): CollectionServiceV4<ClientType, Location, QLocation, EditableLocation>;
    homeAddress(): LocationService<ClientType>;
    features(): CollectionServiceV4<ClientType, EnumCollection<Feature>, QEnumCollection, Feature>;
    friends(): PersonCollectionService<ClientType>;
    friends(id: PersonId): PersonService<ClientType>;
    bestFriend(): PersonService<ClientType>;
    trips(): TripCollectionService<ClientType>;
    trips(id: TripId): TripService<ClientType>;
    bossOffice(): LocationService<ClientType>;
    directReports(): PersonCollectionService<ClientType>;
    directReports(id: PersonId): PersonService<ClientType>;
}
export declare class ManagerCollectionService<ClientType extends ODataHttpClient> extends EntitySetServiceV4<ClientType, Manager, EditableManager, QManager, PersonId> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class LocationService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, Location, EditableLocation, QLocation> {
    private _city?;
    constructor(client: ClientType, basePath: string, name: string);
    city(): CityService<ClientType>;
}
export declare class CityService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, City, EditableCity, QCity> {
    constructor(client: ClientType, basePath: string, name: string);
}
export declare class AirportLocationService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, AirportLocation, EditableAirportLocation, QAirportLocation> {
    private _city?;
    constructor(client: ClientType, basePath: string, name: string);
    city(): CityService<ClientType>;
}
export declare class EventLocationService<ClientType extends ODataHttpClient> extends EntityTypeServiceV4<ClientType, EventLocation, EditableEventLocation, QEventLocation> {
    private _city?;
    constructor(client: ClientType, basePath: string, name: string);
    city(): CityService<ClientType>;
}
